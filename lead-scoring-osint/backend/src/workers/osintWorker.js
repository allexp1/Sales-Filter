const Queue = require('bull');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
require('dotenv').config();

// Import services
const db = require('../models/database');
const logger = require('../utils/logger');
const socketService = require('../services/socketService');
const whoisService = require('../services/whoisService');
const sslService = require('../services/sslService');

// Import additional OSINT services
const dnsService = require('../services/dnsService');
const techStackService = require('../services/techStackService');
const trafficService = require('../services/trafficService');
const businessService = require('../services/businessService');
const emailRiskService = require('../services/emailRiskService');
const githubService = require('../services/githubService');
const archiveService = require('../services/archiveService');
const securityService = require('../services/securityService');

class OSINTWorker {
  constructor() {
    this.queue = new Queue('lead processing', process.env.REDIS_URL || 'redis://localhost:6379');
    this.setupJobProcessor();
  }

  setupJobProcessor() {
    // Process lead enrichment jobs
    this.queue.process('processLeads', 3, async (job) => {
      return this.processLeadsJob(job);
    });

    // Error handling
    this.queue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed:`, err);
      this.updateJobStatus(job.data.jobId, 'failed', 0, err.message);
      socketService.emitJobError(job.data.jobId, err);
    });

    this.queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled`);
    });
  }

  async processLeadsJob(job) {
    const { jobId, userId, filePath, leads, industry } = job.data;
    
    try {
      logger.info(`Starting OSINT processing for job ${jobId} with ${leads.length} leads`);
      
      await this.updateJobStatus(jobId, 'processing', 0);
      await this.logJobMessage(jobId, 'info', 'Starting OSINT enrichment process');
      socketService.emitJobStatusChange(jobId, 'processing', 'Starting OSINT enrichment process');

      const enrichedLeads = [];
      let processedCount = 0;
      let highScoreCount = 0;

      // Process leads in batches to avoid overwhelming APIs
      const batchSize = 5;
      for (let i = 0; i < leads.length; i += batchSize) {
        const batch = leads.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(lead => this.enrichLead(lead, jobId))
        );

        enrichedLeads.push(...batchResults);
        processedCount += batch.length;
        
        // Count high-scoring leads
        const highScoreBatch = batchResults.filter(lead => lead.score >= 70);
        highScoreCount += highScoreBatch.length;

        // Update progress
        const progress = Math.round((processedCount / leads.length) * 100);
        await this.updateJobProgress(jobId, progress, processedCount);
        
        // Update Bull job progress
        job.progress(progress);
        
        // Emit WebSocket progress update
        socketService.emitJobProgress(jobId, progress, processedCount, leads.length);

        logger.info(`Processed batch ${Math.ceil((i + 1) / batchSize)} for job ${jobId} (${processedCount}/${leads.length})`);

        // Add delay between batches to respect rate limits
        if (i + batchSize < leads.length) {
          await this.delay(1000); // 1 second delay
        }
      }

      // Save results to database
      await this.saveLeadResults(jobId, enrichedLeads);

      // Generate Excel file with results
      const resultsFile = await this.generateResultsFile(jobId, enrichedLeads, leads[0]);

      // Update job as completed
      await this.updateJobCompleted(jobId, processedCount, enrichedLeads.length, highScoreCount, resultsFile);
      
      // Emit completion via WebSocket
      socketService.emitJobComplete(jobId, {
        totalLeads: processedCount,
        enrichedLeads: enrichedLeads.length,
        highScoreLeads: highScoreCount,
        resultsFilename: resultsFile
      });
      
      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      logger.info(`Completed OSINT processing for job ${jobId}: ${processedCount} leads processed, ${highScoreCount} high-score leads`);

      return {
        jobId,
        processedLeads: processedCount,
        enrichedLeads: enrichedLeads.length,
        highScoreLeads: highScoreCount
      };

    } catch (error) {
      logger.error(`Error processing job ${jobId}:`, error);
      await this.updateJobStatus(jobId, 'failed', processedCount || 0, error.message);
      socketService.emitJobError(jobId, error);
      throw error;
    }
  }

  async enrichLead(lead, jobId) {
    const enrichedLead = { ...lead };
    const osintData = {};
    let totalScore = 0;
    const scoreBreakdown = {};
    const riskFlags = [];

    try {
      await this.logJobMessage(jobId, 'info', `Enriching ${lead.email}`);
      socketService.emitJobLog(jobId, 'info', `Enriching ${lead.email}`);

      // Domain extraction
      const domain = lead.domain || lead.email.split('@')[1];
      
      // 1. WHOIS Lookup
      try {
        const whoisData = await whoisService.lookup(domain);
        osintData.whois = whoisData;
        totalScore += whoisData.score;
        scoreBreakdown.whois = whoisData.score;
        
        if (whoisData.age !== null && whoisData.age < 30) {
          riskFlags.push('Very new domain (less than 30 days)');
        }
      } catch (error) {
        logger.debug(`WHOIS lookup failed for ${domain}:`, error.message);
        scoreBreakdown.whois = 0;
      }

      // 2. SSL Certificate Analysis
      try {
        const sslData = await sslService.lookup(domain);
        osintData.ssl = sslData;
        totalScore += sslData.score;
        scoreBreakdown.ssl = sslData.score;
        
        if (sslData.activeCertificates === 0) {
          riskFlags.push('No active SSL certificates');
        }
      } catch (error) {
        logger.debug(`SSL lookup failed for ${domain}:`, error.message);
        scoreBreakdown.ssl = 0;
      }

      // 3. Basic domain scoring
      const domainScore = this.scoreDomain(domain, lead.email);
      totalScore += domainScore;
      scoreBreakdown.domain = domainScore;

      // 4. Email pattern analysis
      const emailScore = this.scoreEmail(lead.email);
      totalScore += emailScore;
      scoreBreakdown.email = emailScore;

      // 5. Company name analysis (if available)
      if (lead.company) {
        const companyScore = this.scoreCompany(lead.company);
        totalScore += companyScore;
        scoreBreakdown.company = companyScore;
      }

      // 6. DNS History & Reverse Lookup
      try {
        const dnsData = await dnsService.lookup(domain);
        osintData.dns = dnsData;
        totalScore += dnsData.score;
        scoreBreakdown.dns = dnsData.score;
        
        if (dnsData.records.length === 0) {
          riskFlags.push('No DNS records found');
        }
      } catch (error) {
        logger.debug(`DNS lookup failed for ${domain}:`, error.message);
        scoreBreakdown.dns = 0;
      }

      // 7. Tech Stack Fingerprinting
      try {
        const techData = await techStackService.analyze(domain);
        osintData.techStack = techData;
        totalScore += techData.score;
        scoreBreakdown.techStack = techData.score;
      } catch (error) {
        logger.debug(`Tech stack analysis failed for ${domain}:`, error.message);
        scoreBreakdown.techStack = 0;
      }

      // 8. Traffic Estimates
      try {
        const trafficData = await trafficService.analyze(domain);
        osintData.traffic = trafficData;
        totalScore += trafficData.score;
        scoreBreakdown.traffic = trafficData.score;
        
        if (trafficData.monthlyVisits < 100) {
          riskFlags.push('Very low website traffic');
        }
      } catch (error) {
        logger.debug(`Traffic analysis failed for ${domain}:`, error.message);
        scoreBreakdown.traffic = 0;
      }

      // 9. Business Information
      try {
        const businessData = await businessService.search(lead.company || domain);
        osintData.business = businessData;
        totalScore += businessData.score;
        scoreBreakdown.business = businessData.score;
      } catch (error) {
        logger.debug(`Business search failed for ${lead.company || domain}:`, error.message);
        scoreBreakdown.business = 0;
      }

      // 10. Email Risk Assessment
      try {
        const emailRiskData = await emailRiskService.assess(lead.email, domain);
        osintData.emailRisk = emailRiskData;
        totalScore += emailRiskData.score;
        scoreBreakdown.emailRisk = emailRiskData.score;
        
        if (emailRiskData.riskLevel === 'high') {
          riskFlags.push('High email risk detected');
        }
      } catch (error) {
        logger.debug(`Email risk assessment failed for ${lead.email}:`, error.message);
        scoreBreakdown.emailRisk = 0;
      }

      // 11. GitHub Search (for tech companies)
      if (lead.industry === 'Technology' || domainScore > 5) {
        try {
          const githubData = await githubService.search(lead.company || domain);
          osintData.github = githubData;
          totalScore += githubData.score;
          scoreBreakdown.github = githubData.score;
        } catch (error) {
          logger.debug(`GitHub search failed for ${lead.company || domain}:`, error.message);
          scoreBreakdown.github = 0;
        }
      }

      // 12. Archive searches
      try {
        const archiveData = await archiveService.lookup(domain, `https://${domain}`);
        osintData.archive = archiveData;
        totalScore += archiveData.score;
        scoreBreakdown.archive = archiveData.score;
      } catch (error) {
        logger.debug(`Archive lookup failed for ${domain}:`, error.message);
        scoreBreakdown.archive = 0;
      }

      // 13. Security scans
      try {
        const securityData = await securityService.assess(domain);
        osintData.security = securityData;
        totalScore += securityData.score;
        scoreBreakdown.security = securityData.score;
        
        if (securityData.riskLevel === 'critical') {
          riskFlags.push('Critical security issues detected');
        }
      } catch (error) {
        logger.debug(`Security assessment failed for ${domain}:`, error.message);
        scoreBreakdown.security = 0;
      }

      // Apply risk flags penalties
      totalScore -= riskFlags.length * 5;

      // Normalize score (0-100)
      totalScore = Math.max(0, Math.min(100, totalScore));

      // Determine industry if not provided
      let industry = this.determineIndustry(domain, lead.company);

      // Build enriched lead object
      enrichedLead.domain = domain;
      enrichedLead.industry = industry;
      enrichedLead.score = totalScore;
      enrichedLead.scoreBreakdown = scoreBreakdown;
      enrichedLead.osintData = osintData;
      enrichedLead.riskFlags = riskFlags;

      return enrichedLead;

    } catch (error) {
      logger.error(`Error enriching lead ${lead.email}:`, error);
      
      // Return lead with minimal scoring
      enrichedLead.score = 10; // Minimal score for valid email
      enrichedLead.scoreBreakdown = { error: 'Enrichment failed' };
      enrichedLead.osintData = {};
      enrichedLead.riskFlags = ['Enrichment failed'];
      
      return enrichedLead;
    }
  }

  // Basic domain scoring
  scoreDomain(domain, email) {
    let score = 0;
    
    // Free email providers penalty
    const freeProviders = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'protonmail.com', 'mail.com'
    ];
    
    if (freeProviders.includes(domain.toLowerCase())) {
      return -10; // Penalty for free email
    }
    
    // TLD scoring
    const tld = domain.split('.').pop().toLowerCase();
    if (['com', 'org', 'net'].includes(tld)) {
      score += 10;
    } else if (['edu', 'gov'].includes(tld)) {
      score += 15;
    } else if (['co.uk', 'com.au', 'de', 'fr'].includes(tld)) {
      score += 8;
    }
    
    // Domain length (shorter business domains often more valuable)
    if (domain.length < 15 && domain.length > 4) {
      score += 5;
    }
    
    return score;
  }

  // Email pattern scoring
  scoreEmail(email) {
    let score = 0;
    
    const [localPart] = email.split('@');
    
    // Professional email patterns
    if (localPart.includes('.') || localPart.includes('-')) {
      score += 5; // firstname.lastname or similar
    }
    
    // Common business patterns
    if (/^(info|contact|admin|support|sales|marketing)/.test(localPart)) {
      score += 10;
    }
    
    // Executive patterns
    if (/^(ceo|cto|cfo|president|director|manager)/.test(localPart)) {
      score += 15;
    }
    
    return score;
  }

  // Company name scoring
  scoreCompany(company) {
    let score = 0;
    
    const lowerCompany = company.toLowerCase();
    
    // Business indicators
    const businessTerms = ['inc', 'corp', 'llc', 'ltd', 'company', 'group', 'solutions'];
    if (businessTerms.some(term => lowerCompany.includes(term))) {
      score += 10;
    }
    
    // Size indicators
    if (lowerCompany.includes('international') || lowerCompany.includes('global')) {
      score += 15;
    }
    
    return score;
  }

  // Determine industry from domain/company
  determineIndustry(domain, company = '') {
    const text = `${domain} ${company}`.toLowerCase();
    
    // Simple industry classification
    if (text.includes('tech') || text.includes('software') || text.includes('app')) {
      return 'Technology';
    }
    if (text.includes('health') || text.includes('medical') || text.includes('pharma')) {
      return 'Healthcare';
    }
    if (text.includes('finance') || text.includes('bank') || text.includes('invest')) {
      return 'Finance';
    }
    if (text.includes('edu') || text.includes('university') || text.includes('school')) {
      return 'Education';
    }
    if (text.includes('retail') || text.includes('shop') || text.includes('store')) {
      return 'Retail';
    }
    
    return 'Unknown';
  }

  // Database operations
  async updateJobStatus(jobId, status, progress = null, errorMessage = null) {
    const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];
    
    if (progress !== null) {
      updates.push('progress = ?');
      params.push(progress);
    }
    
    if (errorMessage) {
      updates.push('error_message = ?');
      params.push(errorMessage);
    }
    
    params.push(jobId);
    
    await db.run(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  async updateJobProgress(jobId, progress, processedLeads) {
    await db.run(
      'UPDATE jobs SET progress = ?, processed_leads = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [progress, processedLeads, jobId]
    );
  }

  async updateJobCompleted(jobId, processedLeads, enrichedLeads, highScoreLeads, resultsFile) {
    await db.run(
      `UPDATE jobs SET status = 'completed', progress = 100, processed_leads = ?, 
       enriched_leads = ?, high_score_leads = ?, results_filename = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [processedLeads, enrichedLeads, highScoreLeads, resultsFile, jobId]
    );
  }

  async logJobMessage(jobId, level, message) {
    await db.run(
      'INSERT INTO job_logs (job_id, level, message) VALUES (?, ?, ?)',
      [jobId, level, message]
    );
    
    // Emit log via WebSocket
    socketService.emitJobLog(jobId, level, message);
  }

  async saveLeadResults(jobId, leads) {
    for (const lead of leads) {
      await db.run(
        `INSERT INTO lead_results (job_id, email, domain, company_name, industry, score, score_breakdown, osint_data, risk_flags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          jobId,
          lead.email,
          lead.domain,
          lead.company || lead.name || null,
          lead.industry,
          lead.score,
          JSON.stringify(lead.scoreBreakdown),
          JSON.stringify(lead.osintData),
          JSON.stringify(lead.riskFlags)
        ]
      );
    }
  }

  async generateResultsFile(jobId, leads, sampleLead) {
    const processedDir = path.join(__dirname, '../../processed');
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }

    const filename = `results_${jobId}_${Date.now()}.xlsx`;
    const filePath = path.join(processedDir, filename);

    // Prepare data for Excel
    const excelData = leads.map(lead => ({
      email: lead.email,
      name: lead.name,
      company: lead.company,
      domain: lead.domain,
      industry: lead.industry,
      score: lead.score,
      whois_score: lead.scoreBreakdown?.whois || 0,
      ssl_score: lead.scoreBreakdown?.ssl || 0,
      domain_score: lead.scoreBreakdown?.domain || 0,
      email_score: lead.scoreBreakdown?.email || 0,
      risk_flags: lead.riskFlags?.join('; ') || '',
      whois_age: lead.osintData?.whois?.age || '',
      ssl_certificates: lead.osintData?.ssl?.totalCertificates || 0,
      created_date: new Date().toISOString()
    }));

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Enriched Leads');
    
    // Write file
    XLSX.writeFile(workbook, filePath);

    return filename;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start the worker if this file is run directly
if (require.main === module) {
  const worker = new OSINTWorker();
  logger.info('OSINT Worker started');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down worker gracefully');
    await worker.queue.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down worker gracefully');
    await worker.queue.close();
    process.exit(0);
  });
}

module.exports = OSINTWorker;
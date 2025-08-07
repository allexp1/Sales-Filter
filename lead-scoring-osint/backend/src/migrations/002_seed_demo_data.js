const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

exports.up = async function(db) {
  logger.info('Running migration: 002_seed_demo_data');
  
  try {
    // Check if demo user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', ['demo@example.com']);
    
    if (!existingUser) {
      // Hash the demo password
      const demoPasswordHash = await bcrypt.hash('demo123', 12);
      
      // Create demo user
      const result = await db.run(
        `INSERT INTO users (email, password_hash, first_name, last_name, company, industry, subscription_type, credits_remaining)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'demo@example.com',
          demoPasswordHash,
          'Demo',
          'User',
          'Demo Company',
          'Technology',
          'free',
          100
        ]
      );
      
      const userId = result.id;
      
      // Create a sample completed job
      const jobResult = await db.run(
        `INSERT INTO jobs (user_id, filename, original_filename, status, progress, total_leads, processed_leads, enriched_leads, high_score_leads, results_filename)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          'sample_leads.xlsx',
          'sample_leads.xlsx',
          'completed',
          100,
          10,
          10,
          8,
          5,
          'sample_leads_enriched.xlsx'
        ]
      );
      
      const jobId = jobResult.id;
      
      // Add some job logs
      const logs = [
        { level: 'info', message: 'Job started' },
        { level: 'info', message: 'Processing 10 leads' },
        { level: 'info', message: 'Enriching lead 1/10: john@example.com' },
        { level: 'info', message: 'Enriching lead 2/10: jane@company.com' },
        { level: 'warning', message: 'Rate limit reached for DNS lookup, waiting 60 seconds' },
        { level: 'info', message: 'Enrichment completed for all leads' },
        { level: 'info', message: 'Generating Excel file with results' },
        { level: 'info', message: 'Job completed successfully' }
      ];
      
      for (const log of logs) {
        await db.run(
          'INSERT INTO job_logs (job_id, level, message) VALUES (?, ?, ?)',
          [jobId, log.level, log.message]
        );
      }
      
      // Add some sample lead results
      const leads = [
        {
          email: 'john@example.com',
          domain: 'example.com',
          company_name: 'Example Corp',
          industry: 'Technology',
          score: 85,
          score_breakdown: JSON.stringify({
            dns: 50,
            tech_stack: 45,
            traffic: 70,
            business: 60,
            github: 80,
            archive: 65,
            security: 75
          }),
          osint_data: JSON.stringify({
            dns: { mx_records: true, spf_record: true },
            tech_stack: { technologies: ['React', 'Node.js', 'AWS'] },
            traffic: { monthly_visits: 50000, bounce_rate: 0.45 }
          }),
          risk_flags: JSON.stringify([])
        },
        {
          email: 'jane@company.com',
          domain: 'company.com',
          company_name: 'Company Inc',
          industry: 'Finance',
          score: 72,
          score_breakdown: JSON.stringify({
            dns: 45,
            tech_stack: 35,
            traffic: 60,
            business: 70,
            github: 0,
            archive: 80,
            security: 65
          }),
          osint_data: JSON.stringify({
            dns: { mx_records: true, spf_record: true },
            tech_stack: { technologies: ['WordPress', 'PHP'] },
            traffic: { monthly_visits: 25000, bounce_rate: 0.55 }
          }),
          risk_flags: JSON.stringify(['outdated_technology'])
        }
      ];
      
      for (const lead of leads) {
        await db.run(
          `INSERT INTO lead_results (job_id, email, domain, company_name, industry, score, score_breakdown, osint_data, risk_flags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            jobId,
            lead.email,
            lead.domain,
            lead.company_name,
            lead.industry,
            lead.score,
            lead.score_breakdown,
            lead.osint_data,
            lead.risk_flags
          ]
        );
      }
      
      logger.info('Demo user and sample data created: demo@example.com / demo123');
    } else {
      logger.info('Demo user already exists, skipping seed data');
    }
  } catch (error) {
    logger.error('Seed data migration failed:', error);
    throw error;
  }
  
  logger.info('Migration 002_seed_demo_data completed');
};

exports.down = async function(db) {
  logger.info('Rolling back migration: 002_seed_demo_data');
  
  // Delete demo user and all related data (cascade will handle related records)
  await db.run('DELETE FROM users WHERE email = ?', ['demo@example.com']);
  
  logger.info('Rollback 002_seed_demo_data completed');
};
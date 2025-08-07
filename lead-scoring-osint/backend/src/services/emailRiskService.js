const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class EmailRiskService {
  constructor() {
    // Have I Been Pwned API configuration
    this.hibpApiUrl = process.env.HIBP_API_URL || 'https://haveibeenpwned.com/api/v3';
    this.hibpApiKey = process.env.HIBP_API_KEY;
    
    // Hunter.io API configuration
    this.hunterApiUrl = process.env.HUNTER_API_URL || 'https://api.hunter.io/v2';
    this.hunterApiKey = process.env.HUNTER_API_KEY;
  }

  /**
   * Assess risk and validity of an email address
   * @param {string} email - Email address to assess
   * @param {string} domain - Domain of the company
   * @param {string} companyName - Company name (optional)
   * @returns {Object} Email risk assessment and score
   */
  async lookup(email, domain, companyName = null) {
    const results = {
      hasData: false,
      email: email,
      isValid: false,
      isDeliverable: false,
      isCatchAll: false,
      isRole: false,
      isDisposable: false,
      breachCount: 0,
      breaches: [],
      lastBreachDate: null,
      pasteCount: 0,
      emailPattern: null,
      domainPattern: null,
      suggestedEmails: [],
      riskLevel: 'unknown',
      riskFactors: [],
      score: 0,
      details: {
        format: null,
        gibberish: false,
        webmail: false,
        acceptAll: false,
        blocked: false,
        confidence: 0
      }
    };

    try {
      // Check Have I Been Pwned
      if (this.hibpApiKey) {
        const hibpData = await this.checkHIBP(email);
        this.mergeHIBPData(results, hibpData);
      }

      // Check Hunter.io
      if (this.hunterApiKey) {
        const hunterData = await this.checkHunter(email, domain, companyName);
        this.mergeHunterData(results, hunterData);
      }

      // Perform local email validation and risk assessment
      const localAssessment = this.performLocalAssessment(email, domain);
      this.mergeLocalAssessment(results, localAssessment);

      // Calculate final risk level and score
      this.calculateRiskLevel(results);
      results.score = this.calculateScore(results);
      results.hasData = true;

      return results;
    } catch (error) {
      logger.error(`Email risk assessment failed for ${email}:`, error);
      // Return basic local assessment on API failure
      const localAssessment = this.performLocalAssessment(email, domain);
      this.mergeLocalAssessment(results, localAssessment);
      results.score = this.calculateScore(results);
      return results;
    }
  }

  /**
   * Check Have I Been Pwned API
   */
  async checkHIBP(email) {
    const result = {
      breachCount: 0,
      breaches: [],
      pasteCount: 0,
      lastBreachDate: null
    };

    try {
      // Check breached accounts
      const breachResponse = await axios.get(
        `${this.hibpApiUrl}/breachedaccount/${encodeURIComponent(email)}`,
        {
          headers: {
            'hibp-api-key': this.hibpApiKey,
            'user-agent': 'Lead-Scoring-OSINT'
          },
          params: {
            truncateResponse: false
          }
        }
      );

      const breaches = breachResponse.data || [];
      result.breachCount = breaches.length;
      
      // Extract breach details
      result.breaches = breaches.map(breach => ({
        name: breach.Name,
        domain: breach.Domain,
        date: breach.BreachDate,
        dataClasses: breach.DataClasses,
        isVerified: breach.IsVerified,
        isSensitive: breach.IsSensitive,
        pwnCount: breach.PwnCount
      }));

      // Find most recent breach
      if (breaches.length > 0) {
        const dates = breaches.map(b => new Date(b.BreachDate));
        result.lastBreachDate = new Date(Math.max(...dates));
      }

    } catch (error) {
      if (error.response?.status === 404) {
        // No breaches found - this is good!
        logger.debug(`No breaches found for ${email}`);
      } else {
        logger.debug(`HIBP breach check failed for ${email}:`, error.message);
      }
    }

    try {
      // Check pastes (requires additional API access)
      const pasteResponse = await axios.get(
        `${this.hibpApiUrl}/pasteaccount/${encodeURIComponent(email)}`,
        {
          headers: {
            'hibp-api-key': this.hibpApiKey,
            'user-agent': 'Lead-Scoring-OSINT'
          }
        }
      );

      const pastes = pasteResponse.data || [];
      result.pasteCount = pastes.length;

    } catch (error) {
      if (error.response?.status === 404) {
        // No pastes found
        logger.debug(`No pastes found for ${email}`);
      } else {
        logger.debug(`HIBP paste check failed for ${email}:`, error.message);
      }
    }

    return result;
  }

  /**
   * Check Hunter.io API
   */
  async checkHunter(email, domain, companyName) {
    const result = {
      isValid: false,
      isDeliverable: false,
      confidence: 0,
      format: null,
      pattern: null,
      suggestedEmails: [],
      domainDetails: {}
    };

    try {
      // Verify specific email
      const verifyResponse = await axios.get(
        `${this.hunterApiUrl}/email-verifier`,
        {
          params: {
            email: email,
            api_key: this.hunterApiKey
          }
        }
      );

      const verifyData = verifyResponse.data.data;
      if (verifyData) {
        result.isValid = verifyData.status === 'valid';
        result.isDeliverable = verifyData.result === 'deliverable';
        result.confidence = verifyData.score || 0;
        
        // Extract detailed results
        result.details = {
          acceptAll: verifyData.accept_all || false,
          blocked: verifyData.blocked || false,
          gibberish: verifyData.gibberish || false,
          webmail: verifyData.webmail || false,
          disposable: verifyData.disposable || false,
          role: verifyData.role || false,
          catchAll: verifyData.accept_all || false,
          smtp_server: verifyData.smtp_server,
          smtp_check: verifyData.smtp_check,
          mx_records: verifyData.mx_records
        };

        // Get email sources if available
        if (verifyData.sources && verifyData.sources.length > 0) {
          result.sources = verifyData.sources.map(s => ({
            domain: s.domain,
            uri: s.uri,
            extractedOn: s.extracted_on,
            stillOnPage: s.still_on_page
          }));
        }
      }

    } catch (error) {
      logger.debug(`Hunter email verification failed for ${email}:`, error.message);
    }

    try {
      // Get domain information and patterns
      const domainResponse = await axios.get(
        `${this.hunterApiUrl}/domain-search`,
        {
          params: {
            domain: domain,
            api_key: this.hunterApiKey,
            limit: 10
          }
        }
      );

      const domainData = domainResponse.data.data;
      if (domainData) {
        // Extract email pattern
        if (domainData.pattern) {
          result.pattern = domainData.pattern;
          result.format = this.patternToFormat(domainData.pattern);
        }

        // Get suggested emails
        if (domainData.emails && domainData.emails.length > 0) {
          result.suggestedEmails = domainData.emails.slice(0, 5).map(e => ({
            email: e.value,
            firstName: e.first_name,
            lastName: e.last_name,
            position: e.position,
            department: e.department,
            confidence: e.confidence
          }));
        }

        // Domain details
        result.domainDetails = {
          disposable: domainData.disposable || false,
          webmail: domainData.webmail || false,
          acceptAll: domainData.accept_all || false,
          organization: domainData.organization || companyName
        };
      }

    } catch (error) {
      logger.debug(`Hunter domain search failed for ${domain}:`, error.message);
    }

    return result;
  }

  /**
   * Perform local email validation and risk assessment
   */
  performLocalAssessment(email, domain) {
    const result = {
      isValid: false,
      isRole: false,
      isDisposable: false,
      format: null,
      riskFactors: []
    };

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    result.isValid = emailRegex.test(email);

    if (!result.isValid) {
      result.riskFactors.push('Invalid email format');
      return result;
    }

    const [localPart, emailDomain] = email.split('@');

    // Check if email domain matches company domain
    if (emailDomain !== domain && !domain.includes(emailDomain)) {
      result.riskFactors.push('Email domain mismatch');
    }

    // Check for role-based emails
    const rolePatterns = [
      'admin', 'info', 'contact', 'support', 'sales', 'marketing',
      'hello', 'help', 'service', 'team', 'office', 'mail',
      'noreply', 'no-reply', 'donotreply', 'webmaster', 'postmaster'
    ];
    
    if (rolePatterns.some(pattern => localPart.toLowerCase().includes(pattern))) {
      result.isRole = true;
      result.riskFactors.push('Role-based email');
    }

    // Check for disposable email domains
    const disposableDomains = [
      'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com',
      'mailinator.com', 'maildrop.cc', 'trashmail.com', 'fake-mail.com',
      'yopmail.com', 'sharklasers.com', 'guerrillamail.info', 'spam4.me'
    ];
    
    if (disposableDomains.includes(emailDomain.toLowerCase())) {
      result.isDisposable = true;
      result.riskFactors.push('Disposable email domain');
    }

    // Detect email format pattern
    if (localPart.includes('.')) {
      if (localPart.match(/^[a-z]+\.[a-z]+$/i)) {
        result.format = 'firstname.lastname';
      } else if (localPart.match(/^[a-z]\.[a-z]+$/i)) {
        result.format = 'f.lastname';
      }
    } else if (localPart.match(/^[a-z]+[a-z]+$/i)) {
      result.format = 'firstnamelastname';
    } else if (localPart.match(/^[a-z]+$/i)) {
      result.format = 'firstname';
    }

    // Check for suspicious patterns
    if (localPart.match(/\d{3,}/)) {
      result.riskFactors.push('Excessive numbers in email');
    }

    if (localPart.length < 3) {
      result.riskFactors.push('Very short email username');
    }

    if (localPart.match(/[^a-zA-Z0-9._-]/)) {
      result.riskFactors.push('Unusual characters in email');
    }

    // Check for common test/fake patterns
    const testPatterns = ['test', 'demo', 'example', 'sample', 'fake'];
    if (testPatterns.some(pattern => localPart.toLowerCase().includes(pattern))) {
      result.riskFactors.push('Test/demo email pattern');
    }

    return result;
  }

  /**
   * Convert Hunter pattern to readable format
   */
  patternToFormat(pattern) {
    const formatMap = {
      '{first}': 'firstname',
      '{last}': 'lastname',
      '{first}.{last}': 'firstname.lastname',
      '{f}.{last}': 'f.lastname',
      '{first}_{last}': 'firstname_lastname',
      '{first}{last}': 'firstnamelastname',
      '{f}{last}': 'flastname'
    };
    
    return formatMap[pattern] || pattern;
  }

  /**
   * Merge HIBP data into results
   */
  mergeHIBPData(results, hibpData) {
    results.breachCount = hibpData.breachCount;
    results.breaches = hibpData.breaches;
    results.pasteCount = hibpData.pasteCount;
    results.lastBreachDate = hibpData.lastBreachDate;

    // Add risk factors based on breaches
    if (hibpData.breachCount > 0) {
      results.riskFactors.push(`Found in ${hibpData.breachCount} data breaches`);
      
      // Check for sensitive breaches
      const sensitiveBreaches = hibpData.breaches.filter(b => b.isSensitive);
      if (sensitiveBreaches.length > 0) {
        results.riskFactors.push('Found in sensitive data breaches');
      }

      // Check recency of breaches
      if (hibpData.lastBreachDate) {
        const daysSinceLastBreach = (Date.now() - new Date(hibpData.lastBreachDate)) / (1000 * 60 * 60 * 24);
        if (daysSinceLastBreach < 365) {
          results.riskFactors.push('Recent data breach (within 1 year)');
        }
      }
    }

    if (hibpData.pasteCount > 0) {
      results.riskFactors.push(`Found in ${hibpData.pasteCount} paste dumps`);
    }
  }

  /**
   * Merge Hunter data into results
   */
  mergeHunterData(results, hunterData) {
    results.isValid = hunterData.isValid || results.isValid;
    results.isDeliverable = hunterData.isDeliverable;
    results.emailPattern = hunterData.format;
    results.domainPattern = hunterData.pattern;
    results.suggestedEmails = hunterData.suggestedEmails;
    
    if (hunterData.details) {
      results.isCatchAll = hunterData.details.catchAll || hunterData.details.acceptAll;
      results.isRole = hunterData.details.role || results.isRole;
      results.isDisposable = hunterData.details.disposable || results.isDisposable;
      results.details = { ...results.details, ...hunterData.details };
      results.details.confidence = hunterData.confidence;
    }

    // Add risk factors from Hunter
    if (!hunterData.isDeliverable && hunterData.isValid) {
      results.riskFactors.push('Email not deliverable');
    }

    if (hunterData.details?.blocked) {
      results.riskFactors.push('Email server blocked');
    }

    if (hunterData.details?.gibberish) {
      results.riskFactors.push('Gibberish email pattern detected');
    }

    if (hunterData.confidence < 50 && hunterData.confidence > 0) {
      results.riskFactors.push('Low email confidence score');
    }

    if (hunterData.domainDetails?.disposable) {
      results.riskFactors.push('Disposable email domain');
    }

    if (hunterData.domainDetails?.acceptAll) {
      results.riskFactors.push('Accept-all email domain');
    }
  }

  /**
   * Merge local assessment into results
   */
  mergeLocalAssessment(results, localData) {
    results.isValid = results.isValid || localData.isValid;
    results.isRole = results.isRole || localData.isRole;
    results.isDisposable = results.isDisposable || localData.isDisposable;
    
    if (!results.emailPattern && localData.format) {
      results.emailPattern = localData.format;
    }
    
    // Add unique risk factors
    localData.riskFactors.forEach(factor => {
      if (!results.riskFactors.includes(factor)) {
        results.riskFactors.push(factor);
      }
    });
  }

  /**
   * Calculate overall risk level
   */
  calculateRiskLevel(results) {
    const riskScore = results.riskFactors.length;
    
    // Critical risk factors
    const criticalFactors = [
      'Invalid email format',
      'Email server blocked',
      'Found in sensitive data breaches'
    ];
    
    const hasCritical = results.riskFactors.some(f => 
      criticalFactors.some(cf => f.includes(cf))
    );

    if (hasCritical || riskScore >= 5) {
      results.riskLevel = 'high';
    } else if (riskScore >= 3) {
      results.riskLevel = 'medium';
    } else if (riskScore >= 1) {
      results.riskLevel = 'low';
    } else {
      results.riskLevel = 'minimal';
    }

    // Special cases
    if (results.breachCount >= 5) {
      results.riskLevel = 'high';
    }
    if (results.isDisposable) {
      results.riskLevel = 'high';
    }
  }

  /**
   * Calculate score based on email risk assessment
   */
  calculateScore(results) {
    let score = 50; // Start with neutral score

    // Validity and deliverability (max +20 points)
    if (results.isValid) {
      score += 10;
      if (results.isDeliverable) {
        score += 10;
      }
    } else {
      score -= 20; // Invalid email is major penalty
    }

    // Breach history (max -30 points)
    if (results.breachCount > 0) {
      score -= Math.min(results.breachCount * 3, 20);
      
      // Recent breaches are worse
      if (results.lastBreachDate) {
        const daysSince = (Date.now() - new Date(results.lastBreachDate)) / (1000 * 60 * 60 * 24);
        if (daysSince < 365) score -= 10;
        else if (daysSince < 730) score -= 5;
      }
    }

    // Email type penalties
    if (results.isRole) score -= 15;
    if (results.isDisposable) score -= 30;
    if (results.isCatchAll) score -= 10;

    // Pattern and format (max +15 points)
    if (results.emailPattern) {
      const professionalPatterns = ['firstname.lastname', 'f.lastname', 'firstname_lastname'];
      if (professionalPatterns.includes(results.emailPattern)) {
        score += 15;
      } else {
        score += 5;
      }
    }

    // Confidence score from verification (max +10 points)
    if (results.details.confidence > 0) {
      score += Math.round(results.details.confidence / 10);
    }

    // Risk factors penalties
    score -= results.riskFactors.length * 2;

    // Webmail penalty (but not as severe as disposable)
    if (results.details.webmail) {
      score -= 5;
    }

    // Bonus for clean record
    if (results.breachCount === 0 && results.pasteCount === 0 && results.riskFactors.length === 0) {
      score += 10;
    }

    // Normalize score (0-100)
    return Math.max(0, Math.min(100, score));
  }
}

module.exports = new EmailRiskService();
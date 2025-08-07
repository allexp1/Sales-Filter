const axios = require('axios');
const logger = require('../utils/logger');

class DNSService {
  constructor() {
    this.apiUrl = process.env.SECURITYTRAILS_API_URL || 'https://api.securitytrails.com/v1';
    this.apiKey = process.env.SECURITYTRAILS_API_KEY;
    this.headers = {
      'APIKEY': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Perform DNS lookup and history analysis
   * @param {string} domain - Domain to lookup
   * @returns {Object} DNS information and score
   */
  async lookup(domain) {
    if (!this.apiKey) {
      logger.warn('SecurityTrails API key not configured');
      return this.getDefaultResponse();
    }

    try {
      // Get current DNS records
      const dnsRecords = await this.getDNSRecords(domain);
      
      // Get DNS history
      const dnsHistory = await this.getDNSHistory(domain);
      
      // Get subdomains
      const subdomains = await this.getSubdomains(domain);
      
      // Get reverse DNS (associated domains)
      const associatedDomains = await this.getAssociatedDomains(domain);
      
      // Calculate score based on DNS data
      const score = this.calculateScore({
        dnsRecords,
        dnsHistory,
        subdomains,
        associatedDomains
      });

      return {
        hasValidDNS: true,
        recordTypes: dnsRecords.recordTypes || [],
        recordCount: dnsRecords.totalRecords || 0,
        historyChanges: dnsHistory.changes || 0,
        subdomainCount: subdomains.count || 0,
        associatedDomains: associatedDomains.count || 0,
        dnsAge: dnsHistory.oldestRecord || null,
        score: score,
        details: {
          mxRecords: dnsRecords.mx || [],
          aRecords: dnsRecords.a || [],
          txtRecords: dnsRecords.txt || [],
          nsRecords: dnsRecords.ns || [],
          cnameRecords: dnsRecords.cname || []
        }
      };
    } catch (error) {
      logger.error(`DNS lookup failed for ${domain}:`, error);
      return this.getDefaultResponse();
    }
  }

  /**
   * Get current DNS records
   */
  async getDNSRecords(domain) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/domain/${domain}`,
        { headers: this.headers }
      );

      const data = response.data;
      const records = {
        a: data.current_dns?.a?.values || [],
        aaaa: data.current_dns?.aaaa?.values || [],
        mx: data.current_dns?.mx?.values || [],
        ns: data.current_dns?.ns?.values || [],
        txt: data.current_dns?.txt?.values || [],
        cname: data.current_dns?.cname?.values || [],
        soa: data.current_dns?.soa?.values || []
      };

      // Count total records and types
      let totalRecords = 0;
      const recordTypes = [];

      for (const [type, values] of Object.entries(records)) {
        if (values.length > 0) {
          recordTypes.push(type.toUpperCase());
          totalRecords += values.length;
        }
      }

      return {
        ...records,
        totalRecords,
        recordTypes
      };
    } catch (error) {
      logger.debug(`Failed to get DNS records for ${domain}:`, error.message);
      return {};
    }
  }

  /**
   * Get DNS history
   */
  async getDNSHistory(domain) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/history/${domain}/dns/a`,
        { headers: this.headers }
      );

      const history = response.data.records || [];
      
      // Find oldest record
      let oldestDate = null;
      if (history.length > 0) {
        const dates = history.map(r => new Date(r.first_seen));
        oldestDate = new Date(Math.min(...dates));
      }

      return {
        changes: history.length,
        oldestRecord: oldestDate,
        recentChanges: history.slice(0, 5) // Last 5 changes
      };
    } catch (error) {
      logger.debug(`Failed to get DNS history for ${domain}:`, error.message);
      return { changes: 0, oldestRecord: null };
    }
  }

  /**
   * Get subdomains
   */
  async getSubdomains(domain) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/domain/${domain}/subdomains`,
        { 
          headers: this.headers,
          params: { children_only: 'false' }
        }
      );

      const subdomains = response.data.subdomains || [];
      
      // Analyze subdomain patterns
      const patterns = {
        hasWWW: subdomains.includes('www'),
        hasMail: subdomains.some(s => s.includes('mail')),
        hasAPI: subdomains.some(s => s.includes('api')),
        hasAdmin: subdomains.some(s => s.includes('admin')),
        hasDev: subdomains.some(s => s.includes('dev') || s.includes('test'))
      };

      return {
        count: response.data.subdomain_count || subdomains.length,
        subdomains: subdomains.slice(0, 20), // Top 20 subdomains
        patterns
      };
    } catch (error) {
      logger.debug(`Failed to get subdomains for ${domain}:`, error.message);
      return { count: 0, subdomains: [], patterns: {} };
    }
  }

  /**
   * Get associated domains (reverse DNS)
   */
  async getAssociatedDomains(domain) {
    try {
      // First get the IP address
      const dnsRecords = await this.getDNSRecords(domain);
      if (!dnsRecords.a || dnsRecords.a.length === 0) {
        return { count: 0, domains: [] };
      }

      const ip = dnsRecords.a[0];
      
      // Get domains on same IP
      const response = await axios.get(
        `${this.apiUrl}/ips/list`,
        { 
          headers: this.headers,
          params: { ipv4: ip }
        }
      );

      const domains = response.data.records || [];
      
      return {
        count: domains.length,
        domains: domains.slice(0, 10), // Top 10 associated domains
        sharedHosting: domains.length > 5
      };
    } catch (error) {
      logger.debug(`Failed to get associated domains for ${domain}:`, error.message);
      return { count: 0, domains: [] };
    }
  }

  /**
   * Calculate score based on DNS data
   */
  calculateScore(data) {
    let score = 0;

    // DNS Records scoring (max 25 points)
    if (data.dnsRecords.totalRecords > 0) {
      score += 10;
      
      // MX records indicate email capability
      if (data.dnsRecords.mx && data.dnsRecords.mx.length > 0) {
        score += 5;
      }
      
      // Multiple record types indicate mature setup
      if (data.dnsRecords.recordTypes.length >= 3) {
        score += 5;
      }
      
      // SPF/DKIM records (in TXT) indicate email security
      if (data.dnsRecords.txt && data.dnsRecords.txt.length > 0) {
        const hasSPF = data.dnsRecords.txt.some(t => t.includes('v=spf1'));
        const hasDKIM = data.dnsRecords.txt.some(t => t.includes('v=DKIM1'));
        if (hasSPF) score += 3;
        if (hasDKIM) score += 2;
      }
    }

    // DNS History scoring (max 15 points)
    if (data.dnsHistory.oldestRecord) {
      const ageInDays = (Date.now() - new Date(data.dnsHistory.oldestRecord)) / (1000 * 60 * 60 * 24);
      
      if (ageInDays > 365) score += 10; // Over 1 year
      else if (ageInDays > 180) score += 7; // Over 6 months
      else if (ageInDays > 90) score += 5; // Over 3 months
      else if (ageInDays > 30) score += 3; // Over 1 month
      
      // Stable DNS (few changes) is good
      if (data.dnsHistory.changes < 10) score += 5;
      else if (data.dnsHistory.changes < 20) score += 3;
    }

    // Subdomains scoring (max 10 points)
    if (data.subdomains.count > 0) {
      score += 3;
      
      // Professional subdomains
      if (data.subdomains.patterns.hasWWW) score += 1;
      if (data.subdomains.patterns.hasMail) score += 2;
      if (data.subdomains.patterns.hasAPI) score += 2;
      
      // Many subdomains indicate larger organization
      if (data.subdomains.count > 10) score += 2;
    }

    // Associated domains scoring (max 5 points)
    // Dedicated hosting is better than shared
    if (data.associatedDomains.count === 1) {
      score += 5; // Dedicated IP
    } else if (data.associatedDomains.count < 10) {
      score += 3; // Small shared hosting
    } else if (data.associatedDomains.count < 50) {
      score += 1; // Large shared hosting
    }

    return Math.min(score, 55); // Cap at 55 points for DNS
  }

  /**
   * Get default response when API is not available
   */
  getDefaultResponse() {
    return {
      hasValidDNS: false,
      recordTypes: [],
      recordCount: 0,
      historyChanges: 0,
      subdomainCount: 0,
      associatedDomains: 0,
      dnsAge: null,
      score: 0,
      details: {
        mxRecords: [],
        aRecords: [],
        txtRecords: [],
        nsRecords: [],
        cnameRecords: []
      }
    };
  }
}

module.exports = new DNSService();
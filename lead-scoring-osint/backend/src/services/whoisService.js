const axios = require('axios');
const whois = require('whois');
const logger = require('../utils/logger');

class WhoisService {
  constructor() {
    this.apiUrl = process.env.WHOIS_API_URL;
    this.apiKey = process.env.WHOIS_API_KEY;
    this.cache = new Map();
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  // Get WHOIS information for a domain
  async lookup(domain) {
    try {
      // Check cache first
      const cacheKey = domain.toLowerCase();
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      let whoisData;

      // Try API first if available
      if (this.apiKey && this.apiUrl) {
        whoisData = await this.lookupViaAPI(domain);
      } else {
        // Fallback to local whois
        whoisData = await this.lookupViaLocal(domain);
      }

      const result = this.parseWhoisData(whoisData, domain);

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      logger.error(`WHOIS lookup failed for ${domain}:`, error.message);
      return this.getEmptyResult(domain);
    }
  }

  // Lookup via WhoisXML API
  async lookupViaAPI(domain) {
    try {
      const response = await axios.get(this.apiUrl, {
        params: {
          apiKey: this.apiKey,
          domainName: domain,
          outputFormat: 'JSON'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      logger.error(`WHOIS API lookup failed for ${domain}:`, error.message);
      throw error;
    }
  }

  // Lookup via local whois command
  async lookupViaLocal(domain) {
    return new Promise((resolve, reject) => {
      whois.lookup(domain, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  // Parse WHOIS data into standardized format
  parseWhoisData(data, domain) {
    const result = {
      domain,
      registrar: null,
      createdDate: null,
      updatedDate: null,
      expiresDate: null,
      status: [],
      nameServers: [],
      registrantCountry: null,
      registrantOrg: null,
      adminEmail: null,
      techEmail: null,
      isActive: false,
      age: null,
      score: 0
    };

    try {
      if (typeof data === 'string') {
        // Parse plain text WHOIS response
        this.parseTextWhois(data, result);
      } else if (data && data.WhoisRecord) {
        // Parse API response
        this.parseAPIWhois(data.WhoisRecord, result);
      }

      // Calculate domain age and score
      this.calculateAgeAndScore(result);
    } catch (error) {
      logger.error(`Failed to parse WHOIS data for ${domain}:`, error.message);
    }

    return result;
  }

  // Parse plain text WHOIS response
  parseTextWhois(text, result) {
    const lines = text.split('\n');
    
    for (const line of lines) {
      const lower = line.toLowerCase();
      
      // Registrar
      if (lower.includes('registrar:') || lower.includes('registrar name:')) {
        result.registrar = line.split(':')[1]?.trim();
      }
      
      // Dates
      if (lower.includes('creation date:') || lower.includes('created:')) {
        result.createdDate = this.parseDate(line.split(':')[1]?.trim());
      }
      if (lower.includes('updated date:') || lower.includes('updated:')) {
        result.updatedDate = this.parseDate(line.split(':')[1]?.trim());
      }
      if (lower.includes('expiry date:') || lower.includes('expires:')) {
        result.expiresDate = this.parseDate(line.split(':')[1]?.trim());
      }
      
      // Status
      if (lower.includes('status:')) {
        const status = line.split(':')[1]?.trim();
        if (status && !result.status.includes(status)) {
          result.status.push(status);
        }
      }
      
      // Name servers
      if (lower.includes('name server:') || lower.includes('nserver:')) {
        const ns = line.split(':')[1]?.trim().toLowerCase();
        if (ns && !result.nameServers.includes(ns)) {
          result.nameServers.push(ns);
        }
      }
      
      // Contact info
      if (lower.includes('registrant country:')) {
        result.registrantCountry = line.split(':')[1]?.trim();
      }
      if (lower.includes('registrant organization:')) {
        result.registrantOrg = line.split(':')[1]?.trim();
      }
    }
  }

  // Parse API WHOIS response
  parseAPIWhois(record, result) {
    result.registrar = record.registrarName;
    result.createdDate = record.createdDate;
    result.updatedDate = record.updatedDate;
    result.expiresDate = record.expiresDate;
    
    if (record.status) {
      result.status = Array.isArray(record.status) ? record.status : [record.status];
    }
    
    if (record.nameServers && record.nameServers.hostNames) {
      result.nameServers = record.nameServers.hostNames.map(ns => ns.toLowerCase());
    }
    
    if (record.registrant) {
      result.registrantCountry = record.registrant.country;
      result.registrantOrg = record.registrant.organization;
    }
    
    if (record.administrativeContact) {
      result.adminEmail = record.administrativeContact.email;
    }
    
    if (record.technicalContact) {
      result.techEmail = record.technicalContact.email;
    }
  }

  // Parse date string to ISO format
  parseDate(dateStr) {
    if (!dateStr) return null;
    
    try {
      const date = new Date(dateStr);
      return date.toISOString();
    } catch (error) {
      return null;
    }
  }

  // Calculate domain age and scoring
  calculateAgeAndScore(result) {
    if (result.createdDate) {
      const created = new Date(result.createdDate);
      const now = new Date();
      result.age = Math.floor((now - created) / (1000 * 60 * 60 * 24)); // Days
      
      // Score based on age
      if (result.age > 365 * 5) { // 5+ years
        result.score += 30;
      } else if (result.age > 365 * 2) { // 2+ years
        result.score += 20;
      } else if (result.age > 365) { // 1+ year
        result.score += 10;
      } else if (result.age < 30) { // Less than 30 days
        result.score -= 10;
      }
    }
    
    // Check if domain is active
    result.isActive = result.status.some(status => 
      status.toLowerCase().includes('active') || 
      status.toLowerCase().includes('ok')
    );
    
    if (result.isActive) {
      result.score += 10;
    }
    
    // Bonus for having proper name servers
    if (result.nameServers.length >= 2) {
      result.score += 5;
    }
  }

  // Return empty result structure
  getEmptyResult(domain) {
    return {
      domain,
      registrar: null,
      createdDate: null,
      updatedDate: null,
      expiresDate: null,
      status: [],
      nameServers: [],
      registrantCountry: null,
      registrantOrg: null,
      adminEmail: null,
      techEmail: null,
      isActive: false,
      age: null,
      score: 0
    };
  }

  // Batch lookup for multiple domains
  async batchLookup(domains) {
    const results = {};
    const promises = domains.map(async (domain) => {
      try {
        results[domain] = await this.lookup(domain);
      } catch (error) {
        results[domain] = this.getEmptyResult(domain);
      }
    });

    await Promise.all(promises);
    return results;
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

module.exports = new WhoisService();
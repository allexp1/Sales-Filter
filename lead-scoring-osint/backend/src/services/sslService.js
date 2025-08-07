const axios = require('axios');
const logger = require('../utils/logger');

class SSLService {
  constructor() {
    this.apiUrl = process.env.CRT_SH_API_URL || 'https://crt.sh';
    this.cache = new Map();
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  // Get SSL certificate information for a domain
  async lookup(domain) {
    try {
      // Check cache first
      const cacheKey = domain.toLowerCase();
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      const certificates = await this.getCertificates(domain);
      const result = this.analyzeCertificates(certificates, domain);

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      logger.error(`SSL lookup failed for ${domain}:`, error.message);
      return this.getEmptyResult(domain);
    }
  }

  // Get certificates from crt.sh
  async getCertificates(domain) {
    try {
      const response = await axios.get(`${this.apiUrl}/?q=${domain}&output=json`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Lead-Scoring-OSINT-Tool/1.0'
        }
      });

      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return []; // No certificates found
      }
      throw error;
    }
  }

  // Analyze certificates and extract insights
  analyzeCertificates(certificates, domain) {
    const result = {
      domain,
      totalCertificates: certificates.length,
      activeCertificates: 0,
      expiredCertificates: 0,
      certificateAuthorities: [],
      firstSeen: null,
      lastSeen: null,
      subdomains: new Set(),
      organizations: new Set(),
      validationTypes: new Set(),
      keyAlgorithms: new Set(),
      hasWildcard: false,
      hasValidCert: false,
      trustScore: 0,
      score: 0
    };

    if (certificates.length === 0) {
      return result;
    }

    const now = new Date();
    const validCerts = [];

    certificates.forEach(cert => {
      try {
        const notBefore = new Date(cert.not_before);
        const notAfter = new Date(cert.not_after);
        
        // Track first and last certificate dates
        if (!result.firstSeen || notBefore < new Date(result.firstSeen)) {
          result.firstSeen = cert.not_before;
        }
        if (!result.lastSeen || notAfter > new Date(result.lastSeen)) {
          result.lastSeen = cert.not_after;
        }

        // Check if certificate is currently valid
        if (now >= notBefore && now <= notAfter) {
          result.activeCertificates++;
          validCerts.push(cert);
        } else if (now > notAfter) {
          result.expiredCertificates++;
        }

        // Extract certificate authority
        if (cert.issuer_name) {
          const ca = this.extractCA(cert.issuer_name);
          if (ca && !result.certificateAuthorities.includes(ca)) {
            result.certificateAuthorities.push(ca);
          }
        }

        // Extract organization
        if (cert.name_value) {
          const names = cert.name_value.split('\n');
          names.forEach(name => {
            name = name.trim().toLowerCase();
            
            // Check for wildcards
            if (name.startsWith('*.')) {
              result.hasWildcard = true;
              result.subdomains.add(name);
            } else if (name.includes(domain)) {
              result.subdomains.add(name);
            }
          });
        }

        // Extract organization from subject
        if (cert.common_name && cert.common_name.includes(domain)) {
          result.hasValidCert = true;
        }

      } catch (error) {
        logger.debug(`Error processing certificate for ${domain}:`, error.message);
      }
    });

    // Calculate trust and scoring
    this.calculateTrustScore(result, validCerts);
    this.calculateOverallScore(result);

    // Convert Sets to Arrays for JSON serialization
    result.subdomains = Array.from(result.subdomains);
    result.organizations = Array.from(result.organizations);
    result.validationTypes = Array.from(result.validationTypes);
    result.keyAlgorithms = Array.from(result.keyAlgorithms);

    return result;
  }

  // Extract Certificate Authority from issuer name
  extractCA(issuerName) {
    const caPatterns = [
      /Let's Encrypt/i,
      /DigiCert/i,
      /Symantec/i,
      /GeoTrust/i,
      /RapidSSL/i,
      /Comodo/i,
      /GlobalSign/i,
      /Thawte/i,
      /VeriSign/i,
      /Entrust/i,
      /Amazon/i,
      /Google/i,
      /Microsoft/i
    ];

    for (const pattern of caPatterns) {
      const match = issuerName.match(pattern);
      if (match) {
        return match[0];
      }
    }

    // Extract organization from CN= or O=
    const orgMatch = issuerName.match(/(?:CN|O)=([^,]+)/);
    return orgMatch ? orgMatch[1].trim() : 'Unknown';
  }

  // Calculate trust score based on certificate quality
  calculateTrustScore(result, validCerts) {
    let trustScore = 0;

    // Points for having active certificates
    if (result.activeCertificates > 0) {
      trustScore += 30;
    }

    // Points for trusted CAs
    const trustedCAs = ['Let\'s Encrypt', 'DigiCert', 'GlobalSign', 'GeoTrust'];
    const hasTrustedCA = result.certificateAuthorities.some(ca => 
      trustedCAs.some(trusted => ca.includes(trusted))
    );
    if (hasTrustedCA) {
      trustScore += 20;
    }

    // Points for wildcard certificates (shows infrastructure planning)
    if (result.hasWildcard) {
      trustScore += 10;
    }

    // Points for multiple certificates (shows active maintenance)
    if (result.totalCertificates > 5) {
      trustScore += 15;
    } else if (result.totalCertificates > 1) {
      trustScore += 5;
    }

    // Deduct points for expired certificates without replacement
    if (result.expiredCertificates > 0 && result.activeCertificates === 0) {
      trustScore -= 20;
    }

    result.trustScore = Math.max(0, Math.min(100, trustScore));
  }

  // Calculate overall score contribution
  calculateOverallScore(result) {
    let score = 0;

    // Base score for having SSL certificates
    if (result.totalCertificates > 0) {
      score += 10;
    }

    // Score based on trust level
    if (result.trustScore >= 70) {
      score += 25;
    } else if (result.trustScore >= 50) {
      score += 15;
    } else if (result.trustScore >= 30) {
      score += 5;
    }

    // Bonus for having valid certificate
    if (result.hasValidCert) {
      score += 10;
    }

    // Score based on certificate history (longevity)
    if (result.firstSeen) {
      const firstSeen = new Date(result.firstSeen);
      const ageInDays = (new Date() - firstSeen) / (1000 * 60 * 60 * 24);
      
      if (ageInDays > 365 * 2) { // 2+ years
        score += 10;
      } else if (ageInDays > 365) { // 1+ year
        score += 5;
      }
    }

    result.score = score;
  }

  // Return empty result structure
  getEmptyResult(domain) {
    return {
      domain,
      totalCertificates: 0,
      activeCertificates: 0,
      expiredCertificates: 0,
      certificateAuthorities: [],
      firstSeen: null,
      lastSeen: null,
      subdomains: [],
      organizations: [],
      validationTypes: [],
      keyAlgorithms: [],
      hasWildcard: false,
      hasValidCert: false,
      trustScore: 0,
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

module.exports = new SSLService();
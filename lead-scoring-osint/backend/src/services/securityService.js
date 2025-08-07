const axios = require('axios');
const logger = require('../utils/logger');

class SecurityService {
  constructor() {
    this.shodanApiKey = process.env.SHODAN_API_KEY;
    this.censysId = process.env.CENSYS_API_ID;
    this.censysSecret = process.env.CENSYS_API_SECRET;
    this.shodanBaseUrl = 'https://api.shodan.io';
    this.censysBaseUrl = 'https://search.censys.io/api/v2';
  }

  /**
   * Perform security assessment on a domain/IP
   * @param {string} domain - Domain to assess
   * @param {string} ip - IP address (optional)
   * @returns {Object} Security data and score
   */
  async assess(domain, ip = null) {
    const results = {
      hasData: false,
      openPorts: [],
      vulnerabilities: [],
      sslCertificate: null,
      exposedServices: [],
      securityHeaders: {},
      riskLevel: 'unknown',
      compromiseIndicators: [],
      malwareDetection: false,
      blacklistStatus: {},
      securityScore: 0,
      technologies: [],
      cves: [],
      banners: [],
      httpHeaders: {},
      robotsTxt: null,
      shodanData: null,
      censysData: null,
      recommendations: [],
      score: 0
    };

    try {
      // Get IP if not provided
      if (!ip) {
        ip = await this.resolveIP(domain);
      }

      if (!ip) {
        logger.warn(`Could not resolve IP for domain: ${domain}`);
        return results;
      }

      // Shodan scan
      if (this.shodanApiKey) {
        const shodanResults = await this.shodanScan(ip, domain);
        if (shodanResults.hasData) {
          results.hasData = true;
          this.mergeShodanData(results, shodanResults);
        }
      }

      // Censys scan
      if (this.censysId && this.censysSecret) {
        const censysResults = await this.censysScan(ip, domain);
        if (censysResults.hasData) {
          results.hasData = true;
          this.mergeCensysData(results, censysResults);
        }
      }

      // Fallback security checks if no API keys
      if (!results.hasData) {
        const fallbackResults = await this.fallbackSecurityChecks(domain);
        this.mergeFallbackData(results, fallbackResults);
      }

      // Analyze security posture
      this.analyzeSecurityPosture(results);

      // Generate recommendations
      results.recommendations = this.generateRecommendations(results);

      // Calculate final score
      results.score = this.calculateScore(results);

      return results;
    } catch (error) {
      logger.error(`Security assessment failed for ${domain}:`, error);
      return results;
    }
  }

  /**
   * Resolve domain to IP address
   */
  async resolveIP(domain) {
    try {
      const dns = require('dns').promises;
      const addresses = await dns.resolve4(domain);
      return addresses[0];
    } catch (error) {
      logger.debug(`DNS resolution failed for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Perform Shodan scan
   */
  async shodanScan(ip, domain) {
    const results = {
      hasData: false,
      ports: [],
      services: [],
      vulnerabilities: [],
      technologies: [],
      banners: [],
      httpHeaders: {}
    };

    try {
      // Get host information
      const hostUrl = `${this.shodanBaseUrl}/shodan/host/${ip}`;
      const response = await axios.get(hostUrl, {
        params: { key: this.shodanApiKey }
      });

      const data = response.data;
      results.hasData = true;

      // Extract port information
      if (data.ports) {
        results.ports = data.ports;
      }

      // Extract service information
      if (data.data) {
        data.data.forEach(service => {
          const serviceInfo = {
            port: service.port,
            transport: service.transport,
            product: service.product || 'unknown',
            version: service.version || '',
            banner: service.data || '',
            timestamp: service.timestamp
          };

          // Check for HTTP services
          if (service.http) {
            serviceInfo.http = {
              status: service.http.status,
              title: service.http.title,
              server: service.http.server,
              headers: service.http.headers || {}
            };
            results.httpHeaders = { ...results.httpHeaders, ...service.http.headers };
          }

          // Check for SSL
          if (service.ssl) {
            serviceInfo.ssl = {
              versions: service.ssl.versions,
              cipher: service.ssl.cipher,
              cert: service.ssl.cert
            };
          }

          results.services.push(serviceInfo);
          
          // Collect banners
          if (service.data) {
            results.banners.push({
              port: service.port,
              banner: service.data.substring(0, 200) // Limit banner length
            });
          }
        });
      }

      // Extract vulnerabilities
      if (data.vulns) {
        results.vulnerabilities = data.vulns.map(vuln => ({
          cve: vuln,
          severity: this.getCVESeverity(vuln)
        }));
      }

      // Extract technologies
      if (data.tags) {
        results.technologies = data.tags;
      }

      // Domain-specific search
      await this.shodanDomainSearch(domain, results);

      return results;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        logger.debug(`No Shodan data found for IP ${ip}`);
      } else {
        logger.debug(`Shodan scan failed for ${ip}:`, error.message);
      }
      return results;
    }
  }

  /**
   * Shodan domain search
   */
  async shodanDomainSearch(domain, results) {
    try {
      const searchUrl = `${this.shodanBaseUrl}/shodan/host/search`;
      const response = await axios.get(searchUrl, {
        params: {
          key: this.shodanApiKey,
          query: `hostname:${domain}`,
          facets: 'port,product'
        }
      });

      if (response.data.matches) {
        // Additional domain-specific data
        response.data.matches.forEach(match => {
          // Add any unique ports not already found
          if (match.port && !results.ports.includes(match.port)) {
            results.ports.push(match.port);
          }
        });
      }
    } catch (error) {
      logger.debug(`Shodan domain search failed for ${domain}:`, error.message);
    }
  }

  /**
   * Perform Censys scan
   */
  async censysScan(ip, domain) {
    const results = {
      hasData: false,
      services: [],
      certificates: [],
      autonomousSystem: null,
      location: null
    };

    try {
      // Create auth header
      const auth = Buffer.from(`${this.censysId}:${this.censysSecret}`).toString('base64');
      const headers = {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      };

      // Search for host
      const searchUrl = `${this.censysBaseUrl}/hosts/search`;
      const searchResponse = await axios.post(searchUrl, {
        q: `ip:${ip} OR name:${domain}`,
        per_page: 5,
        virtual_hosts: 'INCLUDE'
      }, { headers });

      if (searchResponse.data.result && searchResponse.data.result.hits) {
        results.hasData = true;
        
        for (const hit of searchResponse.data.result.hits) {
          // Get detailed host information
          if (hit.ip) {
            const hostDetails = await this.getCensysHostDetails(hit.ip, headers);
            if (hostDetails) {
              this.processCensysHost(results, hostDetails);
            }
          }
        }
      }

      // Search for certificates
      await this.censysCertificateSearch(domain, results, headers);

      return results;
    } catch (error) {
      logger.debug(`Censys scan failed for ${ip}:`, error.message);
      return results;
    }
  }

  /**
   * Get Censys host details
   */
  async getCensysHostDetails(ip, headers) {
    try {
      const hostUrl = `${this.censysBaseUrl}/hosts/${ip}`;
      const response = await axios.get(hostUrl, { headers });
      return response.data.result;
    } catch (error) {
      logger.debug(`Censys host details failed for ${ip}:`, error.message);
      return null;
    }
  }

  /**
   * Process Censys host data
   */
  processCensysHost(results, hostData) {
    // Extract services
    if (hostData.services) {
      hostData.services.forEach(service => {
        const serviceInfo = {
          port: service.port,
          protocol: service.service_name,
          transport: service.transport_protocol,
          observed_at: service.observed_at
        };

        // Extract TLS info
        if (service.tls) {
          serviceInfo.tls = {
            version: service.tls.version_selected,
            cipher: service.tls.cipher_suite_selected,
            certificate: service.tls.certificate
          };

          // Add certificate to list
          if (service.tls.certificate) {
            results.certificates.push({
              port: service.port,
              subject: service.tls.certificate.parsed.subject,
              issuer: service.tls.certificate.parsed.issuer,
              validity: {
                not_before: service.tls.certificate.parsed.validity.not_before,
                not_after: service.tls.certificate.parsed.validity.not_after
              }
            });
          }
        }

        // Extract HTTP info
        if (service.http) {
          serviceInfo.http = {
            status_code: service.http.response.status_code,
            body_size: service.http.response.body_size,
            headers: service.http.response.headers
          };
        }

        results.services.push(serviceInfo);
      });
    }

    // Extract autonomous system info
    if (hostData.autonomous_system) {
      results.autonomousSystem = {
        asn: hostData.autonomous_system.asn,
        name: hostData.autonomous_system.name,
        country: hostData.autonomous_system.country_code
      };
    }

    // Extract location
    if (hostData.location) {
      results.location = {
        country: hostData.location.country,
        city: hostData.location.city,
        coordinates: hostData.location.coordinates
      };
    }
  }

  /**
   * Search for certificates in Censys
   */
  async censysCertificateSearch(domain, results, headers) {
    try {
      const certUrl = `${this.censysBaseUrl}/certificates/search`;
      const response = await axios.post(certUrl, {
        q: `names:${domain}`,
        per_page: 10
      }, { headers });

      if (response.data.result && response.data.result.hits) {
        response.data.result.hits.forEach(cert => {
          if (cert.parsed && cert.parsed.subject) {
            results.certificates.push({
              fingerprint: cert.fingerprint_sha256,
              subject: cert.parsed.subject,
              issuer: cert.parsed.issuer,
              not_before: cert.parsed.validity.not_before,
              not_after: cert.parsed.validity.not_after
            });
          }
        });
      }
    } catch (error) {
      logger.debug(`Censys certificate search failed for ${domain}:`, error.message);
    }
  }

  /**
   * Fallback security checks (when no API keys available)
   */
  async fallbackSecurityChecks(domain) {
    const results = {
      openPorts: [],
      sslInfo: null,
      headers: {},
      robotsTxt: null
    };

    try {
      // Check common ports
      const commonPorts = [80, 443, 21, 22, 25, 3306, 5432, 27017, 6379, 9200];
      const openPorts = await this.checkPorts(domain, commonPorts);
      results.openPorts = openPorts;

      // Check HTTPS and get SSL info
      const sslInfo = await this.checkSSL(domain);
      if (sslInfo) {
        results.sslInfo = sslInfo;
      }

      // Get HTTP headers
      const headers = await this.getHTTPHeaders(domain);
      if (headers) {
        results.headers = headers;
      }

      // Check robots.txt
      const robotsTxt = await this.checkRobotsTxt(domain);
      if (robotsTxt) {
        results.robotsTxt = robotsTxt;
      }

      return results;
    } catch (error) {
      logger.debug(`Fallback security checks failed for ${domain}:`, error.message);
      return results;
    }
  }

  /**
   * Check common ports
   */
  async checkPorts(domain, ports) {
    const net = require('net');
    const openPorts = [];

    const checkPort = (port) => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);

        socket.on('connect', () => {
          openPorts.push(port);
          socket.destroy();
          resolve();
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve();
        });

        socket.on('error', () => {
          resolve();
        });

        socket.connect(port, domain);
      });
    };

    // Check ports in batches
    const batchSize = 5;
    for (let i = 0; i < ports.length; i += batchSize) {
      const batch = ports.slice(i, i + batchSize);
      await Promise.all(batch.map(port => checkPort(port)));
    }

    return openPorts;
  }

  /**
   * Check SSL certificate
   */
  async checkSSL(domain) {
    try {
      const https = require('https');
      
      return new Promise((resolve) => {
        const options = {
          hostname: domain,
          port: 443,
          method: 'HEAD',
          timeout: 5000
        };

        const req = https.request(options, (res) => {
          const cert = res.socket.getPeerCertificate();
          
          if (cert && cert.subject) {
            resolve({
              subject: cert.subject,
              issuer: cert.issuer,
              valid_from: cert.valid_from,
              valid_to: cert.valid_to,
              fingerprint: cert.fingerprint,
              serialNumber: cert.serialNumber
            });
          } else {
            resolve(null);
          }
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        req.end();
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Get HTTP headers
   */
  async getHTTPHeaders(domain) {
    try {
      const response = await axios.head(`https://${domain}`, {
        timeout: 5000,
        validateStatus: () => true
      });
      return response.headers;
    } catch (error) {
      try {
        const response = await axios.head(`http://${domain}`, {
          timeout: 5000,
          validateStatus: () => true
        });
        return response.headers;
      } catch (error) {
        return null;
      }
    }
  }

  /**
   * Check robots.txt
   */
  async checkRobotsTxt(domain) {
    try {
      const response = await axios.get(`https://${domain}/robots.txt`, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });
      
      if (response.status === 200) {
        return {
          exists: true,
          content: response.data.substring(0, 1000), // Limit content
          disallowedPaths: this.parseRobotsTxt(response.data)
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse robots.txt for disallowed paths
   */
  parseRobotsTxt(content) {
    const disallowed = [];
    const lines = content.split('\n');
    
    lines.forEach(line => {
      const match = line.match(/^\s*Disallow:\s*(.+)$/i);
      if (match && match[1]) {
        disallowed.push(match[1].trim());
      }
    });

    return disallowed;
  }

  /**
   * Merge Shodan data into results
   */
  mergeShodanData(results, shodanData) {
    results.shodanData = shodanData;
    
    // Merge ports
    results.openPorts = [...new Set([...results.openPorts, ...shodanData.ports])];
    
    // Merge services
    results.exposedServices.push(...shodanData.services.map(s => ({
      port: s.port,
      service: s.product,
      version: s.version,
      source: 'shodan'
    })));

    // Merge vulnerabilities
    results.vulnerabilities.push(...shodanData.vulnerabilities);
    results.cves = shodanData.vulnerabilities.map(v => v.cve);

    // Merge technologies
    results.technologies.push(...shodanData.technologies);

    // Merge banners
    results.banners.push(...shodanData.banners);

    // Merge HTTP headers
    results.httpHeaders = { ...results.httpHeaders, ...shodanData.httpHeaders };
  }

  /**
   * Merge Censys data into results
   */
  mergeCensysData(results, censysData) {
    results.censysData = censysData;

    // Merge services
    censysData.services.forEach(service => {
      const existing = results.exposedServices.find(s => 
        s.port === service.port && s.source === 'censys'
      );
      
      if (!existing) {
        results.exposedServices.push({
          port: service.port,
          service: service.protocol,
          transport: service.transport,
          source: 'censys',
          tls: service.tls ? true : false
        });
      }
    });

    // Merge certificates
    if (censysData.certificates.length > 0) {
      results.sslCertificate = censysData.certificates[0]; // Use most recent
    }

    // Add location data
    if (censysData.location) {
      results.location = censysData.location;
    }

    // Add AS info
    if (censysData.autonomousSystem) {
      results.autonomousSystem = censysData.autonomousSystem;
    }
  }

  /**
   * Merge fallback data into results
   */
  mergeFallbackData(results, fallbackData) {
    if (fallbackData.openPorts.length > 0) {
      results.openPorts = fallbackData.openPorts;
      results.hasData = true;
    }

    if (fallbackData.sslInfo) {
      results.sslCertificate = fallbackData.sslInfo;
    }

    if (fallbackData.headers) {
      results.httpHeaders = fallbackData.headers;
      results.securityHeaders = this.analyzeSecurityHeaders(fallbackData.headers);
    }

    if (fallbackData.robotsTxt) {
      results.robotsTxt = fallbackData.robotsTxt;
    }
  }

  /**
   * Analyze security headers
   */
  analyzeSecurityHeaders(headers) {
    const securityHeaders = {
      'strict-transport-security': false,
      'x-frame-options': false,
      'x-content-type-options': false,
      'x-xss-protection': false,
      'content-security-policy': false,
      'referrer-policy': false,
      'permissions-policy': false
    };

    Object.keys(headers).forEach(header => {
      const lowerHeader = header.toLowerCase();
      if (securityHeaders.hasOwnProperty(lowerHeader)) {
        securityHeaders[lowerHeader] = headers[header];
      }
    });

    return securityHeaders;
  }

  /**
   * Analyze overall security posture
   */
  analyzeSecurityPosture(results) {
    let riskScore = 0;
    const riskFactors = [];

    // Check for dangerous open ports
    const dangerousPorts = [21, 23, 135, 139, 445, 1433, 3306, 5432, 27017, 6379];
    const exposedDangerousPorts = results.openPorts.filter(port => 
      dangerousPorts.includes(port)
    );
    
    if (exposedDangerousPorts.length > 0) {
      riskScore += exposedDangerousPorts.length * 15;
      riskFactors.push(`${exposedDangerousPorts.length} dangerous ports exposed`);
    }

    // Check for vulnerabilities
    if (results.vulnerabilities.length > 0) {
      const criticalVulns = results.vulnerabilities.filter(v => 
        v.severity === 'critical' || v.severity === 'high'
      ).length;
      
      riskScore += results.vulnerabilities.length * 10;
      riskScore += criticalVulns * 15;
      riskFactors.push(`${results.vulnerabilities.length} known vulnerabilities`);
    }

    // Check SSL certificate
    if (!results.sslCertificate) {
      riskScore += 20;
      riskFactors.push('No SSL certificate found');
    } else if (results.sslCertificate.valid_to) {
      const validTo = new Date(results.sslCertificate.valid_to);
      if (validTo < new Date()) {
        riskScore += 30;
        riskFactors.push('SSL certificate expired');
      }
    }

    // Check security headers
    const missingHeaders = Object.values(results.securityHeaders).filter(v => !v).length;
    if (missingHeaders > 4) {
      riskScore += 15;
      riskFactors.push(`Missing ${missingHeaders} security headers`);
    }

    // Determine risk level
    if (riskScore >= 80) {
      results.riskLevel = 'critical';
    } else if (riskScore >= 60) {
      results.riskLevel = 'high';
    } else if (riskScore >= 40) {
      results.riskLevel = 'medium';
    } else if (riskScore >= 20) {
      results.riskLevel = 'low';
    } else {
      results.riskLevel = 'minimal';
    }

    results.compromiseIndicators = riskFactors;
  }

  /**
   * Generate security recommendations
   */
  generateRecommendations(results) {
    const recommendations = [];

    // Port recommendations
    const dangerousPorts = [21, 23, 135, 139, 445, 1433, 3306, 5432, 27017, 6379];
    const exposedDangerousPorts = results.openPorts.filter(port => 
      dangerousPorts.includes(port)
    );
    
    if (exposedDangerousPorts.length > 0) {
      recommendations.push({
        severity: 'high',
        category: 'ports',
        message: `Close or restrict access to dangerous ports: ${exposedDangerousPorts.join(', ')}`
      });
    }

    // SSL recommendations
    if (!results.sslCertificate) {
      recommendations.push({
        severity: 'high',
        category: 'ssl',
        message: 'Implement SSL/TLS encryption for all web services'
      });
    }

    // Security headers recommendations
    const missingHeaders = Object.entries(results.securityHeaders)
      .filter(([k, v]) => !v)
      .map(([k, v]) => k);
    
    if (missingHeaders.length > 0) {
      recommendations.push({
        severity: 'medium',
        category: 'headers',
        message: `Implement missing security headers: ${missingHeaders.join(', ')}`
      });
    }

    // Vulnerability recommendations
    if (results.vulnerabilities.length > 0) {
      const critical = results.vulnerabilities.filter(v => 
        v.severity === 'critical' || v.severity === 'high'
      );
      
      if (critical.length > 0) {
        recommendations.push({
          severity: 'critical',
          category: 'vulnerabilities',
          message: `Patch ${critical.length} critical vulnerabilities immediately`
        });
      }
    }

    return recommendations;
  }

  /**
   * Get CVE severity (simplified)
   */
  getCVESeverity(cve) {
    // In production, you'd look up actual CVSS scores
    const year = parseInt(cve.match(/CVE-(\d{4})/)?.[1] || '0');
    const currentYear = new Date().getFullYear();
    
    if (currentYear - year <= 1) {
      return 'critical';
    } else if (currentYear - year <= 3) {
      return 'high';
    } else if (currentYear - year <= 5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Calculate security score
   */
  calculateScore(data) {
    let score = 50; // Start with neutral score

    // Positive factors
    
    // SSL certificate (max +15 points)
    if (data.sslCertificate) {
      score += 10;
      
      // Check if certificate is valid
      if (data.sslCertificate.valid_to) {
        const validTo = new Date(data.sslCertificate.valid_to);
        if (validTo > new Date()) {
          score += 5;
        }
      }
    }

    // Security headers (max +15 points)
    const presentHeaders = Object.values(data.securityHeaders).filter(v => v).length;
    score += presentHeaders * 2;

    // Limited open ports (max +10 points)
    if (data.openPorts.length <= 3) {
      score += 10;
    } else if (data.openPorts.length <= 5) {
      score += 5;
    }

    // Negative factors

    // Dangerous open ports (max -20 points)
    const dangerousPorts = [21, 23, 135, 139, 445, 1433, 3306, 5432, 27017, 6379];
    const exposedDangerousPorts = data.openPorts.filter(port => 
      dangerousPorts.includes(port)
    );
    score -= exposedDangerousPorts.length * 5;

    // Vulnerabilities (max -30 points)
    score -= data.vulnerabilities.length * 3;
    
    // Critical vulnerabilities
    const criticalVulns = data.vulnerabilities.filter(v => 
      v.severity === 'critical' || v.severity === 'high'
    ).length;
    score -= criticalVulns * 5;

    // Risk level penalty
    switch (data.riskLevel) {
      case 'critical':
        score -= 30;
        break;
      case 'high':
        score -= 20;
        break;
      case 'medium':
        score -= 10;
        break;
      case 'low':
        score -= 5;
        break;
    }

    // Bonus for having security monitoring (indicated by data availability)
    if (data.hasData && (data.shodanData || data.censysData)) {
      score += 10; // Shows security awareness
    }

    // Ensure score stays within bounds
    return Math.max(0, Math.min(100, score));
  }
}

module.exports = new SecurityService();
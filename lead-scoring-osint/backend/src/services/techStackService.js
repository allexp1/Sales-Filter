const axios = require('axios');
const logger = require('../utils/logger');

class TechStackService {
  constructor() {
    // BuiltWith API configuration
    this.builtWithUrl = process.env.BUILTWITH_API_URL || 'https://api.builtwith.com/v20/api.json';
    this.builtWithKey = process.env.BUILTWITH_API_KEY;
    
    // Wappalyzer API configuration
    this.wappalyzerUrl = process.env.WAPPALYZER_API_URL || 'https://api.wappalyzer.com/v2/lookup';
    this.wappalyzerKey = process.env.WAPPALYZER_API_KEY;
  }

  /**
   * Analyze technology stack of a domain
   * @param {string} domain - Domain to analyze
   * @returns {Object} Technology stack information and score
   */
  async lookup(domain) {
    const results = {
      hasData: false,
      technologies: [],
      categories: [],
      score: 0,
      details: {
        cms: [],
        frameworks: [],
        analytics: [],
        hosting: [],
        cdn: [],
        security: [],
        payment: [],
        marketing: [],
        languages: []
      }
    };

    try {
      // Try BuiltWith first
      if (this.builtWithKey) {
        const builtWithData = await this.getBuiltWithData(domain);
        this.mergeResults(results, builtWithData);
      }

      // Then try Wappalyzer
      if (this.wappalyzerKey) {
        const wappalyzerData = await this.getWappalyzerData(domain);
        this.mergeResults(results, wappalyzerData);
      }

      // If no API keys configured, try basic detection
      if (!this.builtWithKey && !this.wappalyzerKey) {
        const basicData = await this.getBasicTechStack(domain);
        this.mergeResults(results, basicData);
      }

      // Calculate score based on tech stack
      results.score = this.calculateScore(results);
      results.hasData = results.technologies.length > 0;

      return results;
    } catch (error) {
      logger.error(`Tech stack lookup failed for ${domain}:`, error);
      return results;
    }
  }

  /**
   * Get data from BuiltWith API
   */
  async getBuiltWithData(domain) {
    try {
      const response = await axios.get(this.builtWithUrl, {
        params: {
          KEY: this.builtWithKey,
          LOOKUP: domain
        }
      });

      const data = response.data.Results?.[0];
      if (!data || !data.Result) {
        return this.getEmptyResult();
      }

      const result = this.getEmptyResult();
      const paths = data.Result.Paths?.[0];
      
      if (paths && paths.Technologies) {
        paths.Technologies.forEach(tech => {
          // Add to technologies list
          result.technologies.push({
            name: tech.Name,
            category: tech.Tag,
            description: tech.Description,
            firstDetected: tech.FirstDetected,
            lastDetected: tech.LastDetected
          });

          // Add to categories
          if (!result.categories.includes(tech.Tag)) {
            result.categories.push(tech.Tag);
          }

          // Categorize technologies
          this.categorizeTechnology(result.details, tech);
        });
      }

      // Add spending information if available
      if (data.Result.Spend) {
        result.estimatedSpend = data.Result.Spend;
      }

      return result;
    } catch (error) {
      logger.debug(`BuiltWith lookup failed for ${domain}:`, error.message);
      return this.getEmptyResult();
    }
  }

  /**
   * Get data from Wappalyzer API
   */
  async getWappalyzerData(domain) {
    try {
      const response = await axios.get(this.wappalyzerUrl, {
        params: {
          url: `https://${domain}`,
          recursive: false
        },
        headers: {
          'x-api-key': this.wappalyzerKey
        }
      });

      const data = response.data;
      const result = this.getEmptyResult();

      if (data && Array.isArray(data)) {
        const technologies = data[0]?.technologies || [];
        
        technologies.forEach(tech => {
          // Add to technologies list
          result.technologies.push({
            name: tech.name,
            category: tech.categories?.[0]?.name || 'Unknown',
            version: tech.version,
            confidence: tech.confidence,
            website: tech.website
          });

          // Add categories
          tech.categories?.forEach(cat => {
            if (!result.categories.includes(cat.name)) {
              result.categories.push(cat.name);
            }
          });

          // Categorize technologies
          this.categorizeTechnologyWappalyzer(result.details, tech);
        });
      }

      return result;
    } catch (error) {
      logger.debug(`Wappalyzer lookup failed for ${domain}:`, error.message);
      return this.getEmptyResult();
    }
  }

  /**
   * Basic tech stack detection without APIs
   */
  async getBasicTechStack(domain) {
    const result = this.getEmptyResult();

    try {
      // Try to fetch the website
      const response = await axios.get(`https://${domain}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeadScoringBot/1.0)'
        }
      });

      const html = response.data;
      const headers = response.headers;

      // Detect from headers
      if (headers['x-powered-by']) {
        result.technologies.push({
          name: headers['x-powered-by'],
          category: 'Web Server',
          source: 'header'
        });
      }

      if (headers['server']) {
        result.technologies.push({
          name: headers['server'],
          category: 'Web Server',
          source: 'header'
        });
      }

      // Basic HTML detection
      if (html.includes('wp-content') || html.includes('wordpress')) {
        result.technologies.push({
          name: 'WordPress',
          category: 'CMS',
          source: 'html'
        });
        result.details.cms.push('WordPress');
      }

      if (html.includes('shopify') || html.includes('cdn.shopify')) {
        result.technologies.push({
          name: 'Shopify',
          category: 'Ecommerce',
          source: 'html'
        });
        result.details.cms.push('Shopify');
      }

      // Detect common frameworks
      if (html.includes('react')) {
        result.details.frameworks.push('React');
      }
      if (html.includes('angular')) {
        result.details.frameworks.push('Angular');
      }
      if (html.includes('vue')) {
        result.details.frameworks.push('Vue.js');
      }

      // Detect analytics
      if (html.includes('google-analytics') || html.includes('ga.js') || html.includes('gtag')) {
        result.details.analytics.push('Google Analytics');
      }

      // Detect CDNs
      if (headers['cf-ray']) {
        result.details.cdn.push('Cloudflare');
      }

    } catch (error) {
      logger.debug(`Basic tech detection failed for ${domain}:`, error.message);
    }

    return result;
  }

  /**
   * Categorize technology for BuiltWith data
   */
  categorizeTechnology(details, tech) {
    const category = tech.Tag?.toLowerCase() || '';
    const name = tech.Name;

    if (category.includes('cms') || ['WordPress', 'Drupal', 'Joomla', 'Shopify'].includes(name)) {
      details.cms.push(name);
    }
    if (category.includes('framework') || category.includes('javascript')) {
      details.frameworks.push(name);
    }
    if (category.includes('analytics') || category.includes('tracking')) {
      details.analytics.push(name);
    }
    if (category.includes('hosting') || category.includes('server')) {
      details.hosting.push(name);
    }
    if (category.includes('cdn')) {
      details.cdn.push(name);
    }
    if (category.includes('security') || category.includes('ssl')) {
      details.security.push(name);
    }
    if (category.includes('payment') || category.includes('ecommerce')) {
      details.payment.push(name);
    }
    if (category.includes('marketing') || category.includes('email')) {
      details.marketing.push(name);
    }
    if (category.includes('language') || ['PHP', 'Python', 'Ruby', 'Java'].includes(name)) {
      details.languages.push(name);
    }
  }

  /**
   * Categorize technology for Wappalyzer data
   */
  categorizeTechnologyWappalyzer(details, tech) {
    tech.categories?.forEach(cat => {
      const category = cat.name.toLowerCase();
      const name = tech.name;

      if (category.includes('cms')) {
        details.cms.push(name);
      }
      if (category.includes('framework')) {
        details.frameworks.push(name);
      }
      if (category.includes('analytics')) {
        details.analytics.push(name);
      }
      if (category.includes('hosting') || category.includes('paas')) {
        details.hosting.push(name);
      }
      if (category.includes('cdn')) {
        details.cdn.push(name);
      }
      if (category.includes('security')) {
        details.security.push(name);
      }
      if (category.includes('payment') || category.includes('ecommerce')) {
        details.payment.push(name);
      }
      if (category.includes('marketing')) {
        details.marketing.push(name);
      }
      if (category.includes('programming')) {
        details.languages.push(name);
      }
    });
  }

  /**
   * Merge results from different sources
   */
  mergeResults(target, source) {
    // Merge technologies (avoid duplicates)
    source.technologies.forEach(tech => {
      const exists = target.technologies.find(t => 
        t.name.toLowerCase() === tech.name.toLowerCase()
      );
      if (!exists) {
        target.technologies.push(tech);
      }
    });

    // Merge categories
    source.categories.forEach(cat => {
      if (!target.categories.includes(cat)) {
        target.categories.push(cat);
      }
    });

    // Merge details (remove duplicates)
    Object.keys(source.details).forEach(key => {
      const existing = new Set(target.details[key]);
      source.details[key].forEach(item => existing.add(item));
      target.details[key] = Array.from(existing);
    });

    // Keep highest spend estimate
    if (source.estimatedSpend && (!target.estimatedSpend || source.estimatedSpend > target.estimatedSpend)) {
      target.estimatedSpend = source.estimatedSpend;
    }
  }

  /**
   * Calculate score based on tech stack
   */
  calculateScore(data) {
    let score = 0;

    // Base score for having any technologies detected (5 points)
    if (data.technologies.length > 0) {
      score += 5;
    }

    // CMS/Platform scoring (max 10 points)
    if (data.details.cms.length > 0) {
      score += 5;
      // Premium/Enterprise CMS
      const premiumCMS = ['Sitecore', 'Adobe Experience Manager', 'Drupal', 'Contentful'];
      if (data.details.cms.some(cms => premiumCMS.includes(cms))) {
        score += 5;
      }
    }

    // Framework scoring (max 8 points)
    if (data.details.frameworks.length > 0) {
      score += 3;
      // Modern frameworks
      const modernFrameworks = ['React', 'Angular', 'Vue.js', 'Next.js', 'Nuxt.js'];
      if (data.details.frameworks.some(fw => modernFrameworks.includes(fw))) {
        score += 5;
      }
    }

    // Analytics scoring (max 7 points)
    if (data.details.analytics.length > 0) {
      score += 3;
      // Advanced analytics
      const advancedAnalytics = ['Google Analytics 4', 'Adobe Analytics', 'Mixpanel', 'Segment'];
      if (data.details.analytics.some(a => advancedAnalytics.includes(a))) {
        score += 4;
      }
    }

    // Security scoring (max 10 points)
    if (data.details.security.length > 0) {
      score += 5;
      // Advanced security
      const advancedSecurity = ['Cloudflare', 'Sucuri', 'Imperva', 'WAF'];
      if (data.details.security.some(s => advancedSecurity.some(as => s.includes(as)))) {
        score += 5;
      }
    }

    // E-commerce/Payment scoring (max 10 points)
    if (data.details.payment.length > 0) {
      score += 5;
      // Premium payment solutions
      const premiumPayment = ['Stripe', 'PayPal', 'Authorize.Net', 'Square'];
      if (data.details.payment.some(p => premiumPayment.includes(p))) {
        score += 5;
      }
    }

    // Marketing tech scoring (max 5 points)
    if (data.details.marketing.length > 0) {
      score += 2;
      // Advanced marketing
      const advancedMarketing = ['HubSpot', 'Marketo', 'Salesforce', 'Pardot'];
      if (data.details.marketing.some(m => advancedMarketing.includes(m))) {
        score += 3;
      }
    }

    // Technology diversity bonus (max 5 points)
    if (data.categories.length >= 5) {
      score += 5;
    } else if (data.categories.length >= 3) {
      score += 3;
    }

    // Estimated spend bonus (max 5 points)
    if (data.estimatedSpend) {
      if (data.estimatedSpend >= 10000) score += 5;
      else if (data.estimatedSpend >= 5000) score += 3;
      else if (data.estimatedSpend >= 1000) score += 1;
    }

    return Math.min(score, 60); // Cap at 60 points for tech stack
  }

  /**
   * Get empty result structure
   */
  getEmptyResult() {
    return {
      technologies: [],
      categories: [],
      details: {
        cms: [],
        frameworks: [],
        analytics: [],
        hosting: [],
        cdn: [],
        security: [],
        payment: [],
        marketing: [],
        languages: []
      }
    };
  }
}

module.exports = new TechStackService();
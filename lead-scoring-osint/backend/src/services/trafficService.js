const axios = require('axios');
const logger = require('../utils/logger');

class TrafficService {
  constructor() {
    this.apiUrl = process.env.SIMILARWEB_API_URL || 'https://api.similarweb.com/v1';
    this.apiKey = process.env.SIMILARWEB_API_KEY;
  }

  /**
   * Get traffic estimates and web metrics for a domain
   * @param {string} domain - Domain to analyze
   * @returns {Object} Traffic data and score
   */
  async lookup(domain) {
    const results = {
      hasData: false,
      monthlyVisits: 0,
      avgVisitDuration: 0,
      pagesPerVisit: 0,
      bounceRate: 0,
      trafficSources: {
        direct: 0,
        search: 0,
        social: 0,
        referral: 0,
        mail: 0,
        display: 0
      },
      topCountries: [],
      globalRank: null,
      countryRank: null,
      categoryRank: null,
      category: null,
      competitors: [],
      trend: 'stable',
      score: 0
    };

    try {
      if (!this.apiKey) {
        logger.warn('SimilarWeb API key not configured');
        // Try alternative free methods
        return await this.getAlternativeTrafficData(domain);
      }

      // Get general web metrics
      const metrics = await this.getWebsiteMetrics(domain);
      if (metrics) {
        Object.assign(results, metrics);
      }

      // Get traffic sources
      const sources = await this.getTrafficSources(domain);
      if (sources) {
        results.trafficSources = sources;
      }

      // Get geographic distribution
      const geography = await this.getGeography(domain);
      if (geography) {
        results.topCountries = geography;
      }

      // Get competitors
      const competitors = await this.getCompetitors(domain);
      if (competitors) {
        results.competitors = competitors;
      }

      // Calculate score based on traffic data
      results.score = this.calculateScore(results);
      results.hasData = results.monthlyVisits > 0 || results.globalRank !== null;

      return results;
    } catch (error) {
      logger.error(`Traffic lookup failed for ${domain}:`, error);
      return results;
    }
  }

  /**
   * Get general website metrics
   */
  async getWebsiteMetrics(domain) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/website/${domain}/total-traffic-and-engagement/visits`,
        {
          headers: {
            'api-key': this.apiKey
          },
          params: {
            api_key: this.apiKey,
            country: 'world',
            main_domain_only: true,
            granularity: 'monthly',
            start_date: this.getStartDate(6), // Last 6 months
            end_date: this.getEndDate()
          }
        }
      );

      const data = response.data;
      const visits = data.visits || [];

      // Calculate average monthly visits
      const totalVisits = visits.reduce((sum, month) => sum + (month.visits || 0), 0);
      const avgMonthlyVisits = visits.length > 0 ? Math.round(totalVisits / visits.length) : 0;

      // Determine trend
      let trend = 'stable';
      if (visits.length >= 3) {
        const recentAvg = visits.slice(-3).reduce((sum, m) => sum + m.visits, 0) / 3;
        const olderAvg = visits.slice(0, 3).reduce((sum, m) => sum + m.visits, 0) / 3;
        
        if (recentAvg > olderAvg * 1.2) trend = 'growing';
        else if (recentAvg < olderAvg * 0.8) trend = 'declining';
      }

      // Get additional engagement metrics
      const engagement = await this.getEngagementMetrics(domain);

      return {
        monthlyVisits: avgMonthlyVisits,
        avgVisitDuration: engagement.avgVisitDuration || 0,
        pagesPerVisit: engagement.pagesPerVisit || 0,
        bounceRate: engagement.bounceRate || 0,
        trend: trend,
        ...this.getRankingData(data)
      };
    } catch (error) {
      logger.debug(`Failed to get website metrics for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(domain) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/website/${domain}/engagement-metrics/all`,
        {
          headers: {
            'api-key': this.apiKey
          },
          params: {
            api_key: this.apiKey,
            country: 'world',
            main_domain_only: true
          }
        }
      );

      const data = response.data;
      return {
        avgVisitDuration: Math.round(data.avg_visit_duration || 0),
        pagesPerVisit: parseFloat((data.pages_per_visit || 0).toFixed(2)),
        bounceRate: parseFloat((data.bounce_rate || 0).toFixed(2))
      };
    } catch (error) {
      logger.debug(`Failed to get engagement metrics for ${domain}:`, error.message);
      return {};
    }
  }

  /**
   * Get traffic sources breakdown
   */
  async getTrafficSources(domain) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/website/${domain}/traffic-sources/overview`,
        {
          headers: {
            'api-key': this.apiKey
          },
          params: {
            api_key: this.apiKey,
            country: 'world',
            main_domain_only: true
          }
        }
      );

      const data = response.data;
      const sources = data.overview || {};

      return {
        direct: Math.round((sources.Direct || 0) * 100),
        search: Math.round(((sources['Organic Search'] || 0) + (sources['Paid Search'] || 0)) * 100),
        social: Math.round((sources.Social || 0) * 100),
        referral: Math.round((sources.Referrals || 0) * 100),
        mail: Math.round((sources.Mail || 0) * 100),
        display: Math.round((sources.Display || 0) * 100)
      };
    } catch (error) {
      logger.debug(`Failed to get traffic sources for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Get geographic distribution
   */
  async getGeography(domain) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/website/${domain}/geo/traffic-by-country`,
        {
          headers: {
            'api-key': this.apiKey
          },
          params: {
            api_key: this.apiKey,
            main_domain_only: true
          }
        }
      );

      const data = response.data;
      const countries = data.records || [];

      return countries.slice(0, 5).map(country => ({
        country: country.country_name,
        code: country.country_code,
        share: Math.round(country.share * 100)
      }));
    } catch (error) {
      logger.debug(`Failed to get geography for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Get competitor analysis
   */
  async getCompetitors(domain) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/website/${domain}/similar-sites/similarsites`,
        {
          headers: {
            'api-key': this.apiKey
          },
          params: {
            api_key: this.apiKey,
            limit: 5
          }
        }
      );

      const data = response.data;
      const similarSites = data.similar_sites || [];

      return similarSites.map(site => ({
        domain: site.site,
        similarity: Math.round(site.similarity * 100)
      }));
    } catch (error) {
      logger.debug(`Failed to get competitors for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Extract ranking data
   */
  getRankingData(data) {
    const result = {};
    
    if (data.global_rank) {
      result.globalRank = data.global_rank.rank;
    }
    
    if (data.country_rank) {
      result.countryRank = data.country_rank.rank;
      result.countryCode = data.country_rank.country;
    }
    
    if (data.category_rank) {
      result.categoryRank = data.category_rank.rank;
      result.category = data.category_rank.category;
    }

    return result;
  }

  /**
   * Get alternative traffic data using free methods
   */
  async getAlternativeTrafficData(domain) {
    const results = {
      hasData: false,
      monthlyVisits: 0,
      avgVisitDuration: 0,
      pagesPerVisit: 0,
      bounceRate: 0,
      trafficSources: {
        direct: 0,
        search: 0,
        social: 0,
        referral: 0,
        mail: 0,
        display: 0
      },
      topCountries: [],
      globalRank: null,
      countryRank: null,
      categoryRank: null,
      category: null,
      competitors: [],
      trend: 'unknown',
      score: 0
    };

    try {
      // Try to get Alexa rank (if still available)
      const alexaData = await this.getAlexaRank(domain);
      if (alexaData.rank) {
        results.globalRank = alexaData.rank;
        results.hasData = true;
      }

      // Estimate traffic based on domain characteristics
      const estimation = this.estimateTraffic(domain, results.globalRank);
      results.monthlyVisits = estimation.visits;
      results.score = estimation.score;

      return results;
    } catch (error) {
      logger.debug(`Alternative traffic lookup failed for ${domain}:`, error.message);
      return results;
    }
  }

  /**
   * Get Alexa rank (legacy method)
   */
  async getAlexaRank(domain) {
    try {
      // This is a placeholder - Alexa was discontinued in 2022
      // You might want to use other services or remove this
      return { rank: null };
    } catch (error) {
      return { rank: null };
    }
  }

  /**
   * Estimate traffic based on domain characteristics
   */
  estimateTraffic(domain, globalRank) {
    let estimatedVisits = 0;
    let score = 0;

    // Very rough estimation based on global rank
    if (globalRank) {
      if (globalRank < 1000) {
        estimatedVisits = 10000000; // 10M+
        score = 20;
      } else if (globalRank < 10000) {
        estimatedVisits = 1000000; // 1M+
        score = 15;
      } else if (globalRank < 100000) {
        estimatedVisits = 100000; // 100K+
        score = 10;
      } else if (globalRank < 1000000) {
        estimatedVisits = 10000; // 10K+
        score = 5;
      } else {
        estimatedVisits = 1000; // 1K+
        score = 2;
      }
    }

    // Additional scoring based on domain
    const tld = domain.split('.').pop();
    if (['com', 'org', 'net'].includes(tld)) {
      score += 2;
    }

    return { visits: estimatedVisits, score };
  }

  /**
   * Calculate score based on traffic data
   */
  calculateScore(data) {
    let score = 0;

    // Traffic volume scoring (max 25 points)
    if (data.monthlyVisits > 0) {
      if (data.monthlyVisits >= 1000000) score += 25;
      else if (data.monthlyVisits >= 100000) score += 20;
      else if (data.monthlyVisits >= 10000) score += 15;
      else if (data.monthlyVisits >= 1000) score += 10;
      else if (data.monthlyVisits >= 100) score += 5;
      else score += 2;
    }

    // Engagement scoring (max 20 points)
    if (data.avgVisitDuration > 0) {
      if (data.avgVisitDuration >= 180) score += 10; // 3+ minutes
      else if (data.avgVisitDuration >= 120) score += 7; // 2+ minutes
      else if (data.avgVisitDuration >= 60) score += 5; // 1+ minute
      else score += 2;
    }

    if (data.pagesPerVisit > 0) {
      if (data.pagesPerVisit >= 4) score += 5;
      else if (data.pagesPerVisit >= 2.5) score += 3;
      else if (data.pagesPerVisit >= 1.5) score += 1;
    }

    // Low bounce rate is good (max 5 points)
    if (data.bounceRate > 0) {
      if (data.bounceRate <= 30) score += 5;
      else if (data.bounceRate <= 50) score += 3;
      else if (data.bounceRate <= 70) score += 1;
    }

    // Traffic sources diversity (max 10 points)
    const sources = Object.values(data.trafficSources);
    const nonZeroSources = sources.filter(s => s > 10).length;
    if (nonZeroSources >= 4) score += 10;
    else if (nonZeroSources >= 3) score += 7;
    else if (nonZeroSources >= 2) score += 4;

    // Strong organic search traffic (max 5 points)
    if (data.trafficSources.search >= 40) score += 5;
    else if (data.trafficSources.search >= 25) score += 3;

    // Global presence (max 5 points)
    if (data.topCountries.length >= 5) score += 5;
    else if (data.topCountries.length >= 3) score += 3;

    // Ranking bonus (max 10 points)
    if (data.globalRank) {
      if (data.globalRank <= 10000) score += 10;
      else if (data.globalRank <= 100000) score += 7;
      else if (data.globalRank <= 1000000) score += 4;
      else if (data.globalRank <= 5000000) score += 2;
    }

    // Growth trend bonus (max 5 points)
    if (data.trend === 'growing') score += 5;
    else if (data.trend === 'stable') score += 2;

    return Math.min(score, 85); // Cap at 85 points for traffic
  }

  /**
   * Helper function to get start date
   */
  getStartDate(monthsAgo) {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    return date.toISOString().slice(0, 7); // YYYY-MM format
  }

  /**
   * Helper function to get end date
   */
  getEndDate() {
    const date = new Date();
    date.setMonth(date.getMonth() - 1); // Last complete month
    return date.toISOString().slice(0, 7); // YYYY-MM format
  }
}

module.exports = new TrafficService();
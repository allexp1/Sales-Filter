const axios = require('axios');
const logger = require('../utils/logger');

class ArchiveService {
  constructor() {
    this.waybackUrl = process.env.WAYBACK_MACHINE_API_URL || 'https://web.archive.org/wayback/available';
    this.cdxUrl = 'https://web.archive.org/cdx/search/cdx';
    this.googleCacheUrl = 'https://webcache.googleusercontent.com/search';
  }

  /**
   * Search web archives for domain history and changes
   * @param {string} domain - Domain to search
   * @param {string} url - Full URL (optional, defaults to domain)
   * @returns {Object} Archive data and score
   */
  async lookup(domain, url = null) {
    const targetUrl = url || `https://${domain}`;
    
    const results = {
      hasData: false,
      isArchived: false,
      firstArchivedDate: null,
      lastArchivedDate: null,
      totalSnapshots: 0,
      yearlySnapshots: {},
      significantChanges: [],
      historicalTitles: [],
      historicalKeywords: [],
      domainAge: null,
      consistencyScore: 0,
      majorEventsTimeline: [],
      archiveHealth: 'unknown',
      googleCached: false,
      googleCacheDate: null,
      historicalTechnologies: [],
      businessPivots: [],
      score: 0
    };

    try {
      // Check Wayback Machine availability
      const waybackData = await this.checkWaybackMachine(targetUrl);
      if (waybackData.available) {
        results.isArchived = true;
        results.hasData = true;
        Object.assign(results, waybackData);
      }

      // Get detailed CDX data for timeline analysis
      if (results.isArchived) {
        const cdxData = await this.getCDXData(targetUrl);
        this.mergeCDXData(results, cdxData);
      }

      // Check Google Cache
      const googleCache = await this.checkGoogleCache(targetUrl);
      if (googleCache.cached) {
        results.googleCached = true;
        results.googleCacheDate = googleCache.date;
      }

      // Analyze archive health and consistency
      this.analyzeArchiveHealth(results);

      // Calculate score
      results.score = this.calculateScore(results);

      return results;
    } catch (error) {
      logger.error(`Archive lookup failed for ${domain}:`, error);
      return results;
    }
  }

  /**
   * Check Wayback Machine for URL
   */
  async checkWaybackMachine(url) {
    try {
      const response = await axios.get(this.waybackUrl, {
        params: { url: url }
      });

      const data = response.data;
      
      if (!data.archived_snapshots || !data.archived_snapshots.closest) {
        return { available: false };
      }

      const closest = data.archived_snapshots.closest;
      
      return {
        available: closest.available === true,
        firstSnapshot: {
          timestamp: closest.timestamp,
          url: closest.url,
          status: closest.status
        }
      };
    } catch (error) {
      logger.debug(`Wayback Machine check failed for ${url}:`, error.message);
      return { available: false };
    }
  }

  /**
   * Get detailed CDX data from Wayback Machine
   */
  async getCDXData(url) {
    const result = {
      snapshots: [],
      yearlyBreakdown: {},
      statusCodes: {},
      contentTypes: {},
      timeline: []
    };

    try {
      // Get CDX data with pagination support
      let page = 0;
      let hasMore = true;
      const allSnapshots = [];

      while (hasMore && page < 5) { // Limit to 5 pages
        const response = await axios.get(this.cdxUrl, {
          params: {
            url: url,
            output: 'json',
            fl: 'timestamp,original,statuscode,mimetype,length,digest',
            filter: 'statuscode:200',
            collapse: 'digest',
            limit: 1000,
            page: page
          }
        });

        const data = response.data;
        
        // First row is headers
        if (page === 0 && data.length > 0) {
          data.shift(); // Remove headers
        }

        if (data.length === 0) {
          hasMore = false;
        } else {
          allSnapshots.push(...data);
          page++;
        }
      }

      // Process snapshots
      allSnapshots.forEach(snapshot => {
        const [timestamp, original, statusCode, mimeType, length, digest] = snapshot;
        const date = this.parseTimestamp(timestamp);
        const year = date.getFullYear();

        // Track yearly breakdown
        if (!result.yearlyBreakdown[year]) {
          result.yearlyBreakdown[year] = 0;
        }
        result.yearlyBreakdown[year]++;

        // Track status codes
        if (!result.statusCodes[statusCode]) {
          result.statusCodes[statusCode] = 0;
        }
        result.statusCodes[statusCode]++;

        // Track content types
        if (mimeType && !result.contentTypes[mimeType]) {
          result.contentTypes[mimeType] = 0;
        }
        if (mimeType) {
          result.contentTypes[mimeType]++;
        }

        // Add to snapshots list
        result.snapshots.push({
          timestamp,
          date,
          year,
          statusCode,
          mimeType,
          size: parseInt(length) || 0,
          digest
        });
      });

      // Sort snapshots by date
      result.snapshots.sort((a, b) => a.date - b.date);

      // Build timeline of significant events
      result.timeline = this.buildTimeline(result.snapshots);

      return result;
    } catch (error) {
      logger.debug(`CDX data fetch failed for ${url}:`, error.message);
      return result;
    }
  }

  /**
   * Check Google Cache
   */
  async checkGoogleCache(url) {
    try {
      // Note: Direct Google Cache API doesn't exist, this is a workaround
      // In production, you might want to use a headless browser or scraping service
      const cacheUrl = `${this.googleCacheUrl}?q=cache:${encodeURIComponent(url)}`;
      
      // For now, we'll just check if the URL would be valid
      // In a real implementation, you'd need to actually fetch and parse the page
      return {
        cached: false, // Default to false without actual check
        date: null,
        url: cacheUrl
      };
    } catch (error) {
      logger.debug(`Google Cache check failed for ${url}:`, error.message);
      return { cached: false };
    }
  }

  /**
   * Merge CDX data into results
   */
  mergeCDXData(results, cdxData) {
    if (cdxData.snapshots.length === 0) return;

    // Set date ranges
    results.firstArchivedDate = cdxData.snapshots[0].date;
    results.lastArchivedDate = cdxData.snapshots[cdxData.snapshots.length - 1].date;
    results.totalSnapshots = cdxData.snapshots.length;
    results.yearlySnapshots = cdxData.yearlyBreakdown;

    // Calculate domain age
    const firstDate = new Date(results.firstArchivedDate);
    const ageInDays = (Date.now() - firstDate) / (1000 * 60 * 60 * 24);
    results.domainAge = Math.round(ageInDays);

    // Identify significant changes based on digest changes
    const digestChanges = this.identifyDigestChanges(cdxData.snapshots);
    results.significantChanges = digestChanges;

    // Extract timeline events
    results.majorEventsTimeline = cdxData.timeline;

    // Analyze content type evolution (potential tech changes)
    results.historicalTechnologies = this.analyzeContentTypes(cdxData.contentTypes);
  }

  /**
   * Identify significant changes based on content digests
   */
  identifyDigestChanges(snapshots) {
    const changes = [];
    let lastDigest = null;
    let lastDate = null;

    snapshots.forEach(snapshot => {
      if (lastDigest && snapshot.digest !== lastDigest) {
        changes.push({
          date: snapshot.date,
          previousDate: lastDate,
          type: 'content_change',
          daysSinceLast: lastDate ? Math.round((snapshot.date - lastDate) / (1000 * 60 * 60 * 24)) : null
        });
      }
      lastDigest = snapshot.digest;
      lastDate = snapshot.date;
    });

    // Keep only significant changes (more than 30 days apart)
    return changes.filter(change => !change.daysSinceLast || change.daysSinceLast > 30);
  }

  /**
   * Build timeline of major events
   */
  buildTimeline(snapshots) {
    const timeline = [];
    const years = {};

    // Group by year
    snapshots.forEach(snapshot => {
      const year = snapshot.year;
      if (!years[year]) {
        years[year] = {
          year,
          count: 0,
          firstSnapshot: snapshot.date,
          lastSnapshot: snapshot.date
        };
      }
      years[year].count++;
      years[year].lastSnapshot = snapshot.date;
    });

    // Build timeline entries
    Object.values(years).forEach(yearData => {
      timeline.push({
        year: yearData.year,
        event: `Active with ${yearData.count} snapshots`,
        significance: yearData.count > 50 ? 'high' : yearData.count > 10 ? 'medium' : 'low'
      });
    });

    // Add gaps in timeline
    const yearsList = Object.keys(years).map(y => parseInt(y)).sort();
    for (let i = 1; i < yearsList.length; i++) {
      const gap = yearsList[i] - yearsList[i - 1];
      if (gap > 1) {
        timeline.push({
          year: yearsList[i - 1] + 1,
          event: `${gap - 1} year gap in archives`,
          significance: 'medium'
        });
      }
    }

    return timeline.sort((a, b) => a.year - b.year);
  }

  /**
   * Analyze content types to identify technology changes
   */
  analyzeContentTypes(contentTypes) {
    const technologies = [];
    
    Object.entries(contentTypes).forEach(([type, count]) => {
      if (type.includes('javascript') || type.includes('json')) {
        technologies.push({ tech: 'JavaScript/AJAX', indicator: type, frequency: count });
      }
      if (type.includes('php')) {
        technologies.push({ tech: 'PHP', indicator: type, frequency: count });
      }
      if (type.includes('asp')) {
        technologies.push({ tech: 'ASP.NET', indicator: type, frequency: count });
      }
      if (type.includes('jsp')) {
        technologies.push({ tech: 'Java/JSP', indicator: type, frequency: count });
      }
    });

    return technologies;
  }

  /**
   * Analyze archive health and consistency
   */
  analyzeArchiveHealth(results) {
    if (!results.isArchived) {
      results.archiveHealth = 'none';
      results.consistencyScore = 0;
      return;
    }

    let healthScore = 0;
    let consistencyScore = 0;

    // Check total snapshots
    if (results.totalSnapshots >= 100) {
      healthScore += 40;
    } else if (results.totalSnapshots >= 50) {
      healthScore += 30;
    } else if (results.totalSnapshots >= 20) {
      healthScore += 20;
    } else if (results.totalSnapshots >= 10) {
      healthScore += 10;
    }

    // Check age
    if (results.domainAge >= 3650) { // 10+ years
      healthScore += 30;
      consistencyScore += 40;
    } else if (results.domainAge >= 1825) { // 5+ years
      healthScore += 20;
      consistencyScore += 30;
    } else if (results.domainAge >= 730) { // 2+ years
      healthScore += 10;
      consistencyScore += 20;
    } else if (results.domainAge >= 365) { // 1+ year
      healthScore += 5;
      consistencyScore += 10;
    }

    // Check yearly consistency
    const years = Object.keys(results.yearlySnapshots);
    const expectedYears = Math.ceil(results.domainAge / 365);
    const coverageRatio = years.length / expectedYears;
    
    if (coverageRatio >= 0.8) {
      consistencyScore += 30;
    } else if (coverageRatio >= 0.6) {
      consistencyScore += 20;
    } else if (coverageRatio >= 0.4) {
      consistencyScore += 10;
    }

    // Check recent activity
    if (results.lastArchivedDate) {
      const daysSinceLastArchive = (Date.now() - new Date(results.lastArchivedDate)) / (1000 * 60 * 60 * 24);
      if (daysSinceLastArchive <= 30) {
        healthScore += 20;
        consistencyScore += 20;
      } else if (daysSinceLastArchive <= 90) {
        healthScore += 15;
        consistencyScore += 15;
      } else if (daysSinceLastArchive <= 180) {
        healthScore += 10;
        consistencyScore += 10;
      } else if (daysSinceLastArchive <= 365) {
        healthScore += 5;
        consistencyScore += 5;
      }
    }

    // Check for major gaps
    const hasGaps = results.majorEventsTimeline.some(event => event.event.includes('gap'));
    if (!hasGaps) {
      consistencyScore += 10;
    }

    // Determine archive health
    if (healthScore >= 70) {
      results.archiveHealth = 'excellent';
    } else if (healthScore >= 50) {
      results.archiveHealth = 'good';
    } else if (healthScore >= 30) {
      results.archiveHealth = 'fair';
    } else {
      results.archiveHealth = 'poor';
    }

    results.consistencyScore = Math.min(100, consistencyScore);
  }

  /**
   * Parse Wayback Machine timestamp
   */
  parseTimestamp(timestamp) {
    // Format: YYYYMMDDhhmmss
    const year = timestamp.substr(0, 4);
    const month = timestamp.substr(4, 2);
    const day = timestamp.substr(6, 2);
    const hour = timestamp.substr(8, 2);
    const minute = timestamp.substr(10, 2);
    const second = timestamp.substr(12, 2);
    
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  }

  /**
   * Calculate score based on archive data
   */
  calculateScore(data) {
    let score = 0;

    // Archive presence (max 10 points)
    if (data.isArchived) {
      score += 10;
    }

    // Domain age (max 20 points)
    if (data.domainAge >= 3650) { // 10+ years
      score += 20;
    } else if (data.domainAge >= 1825) { // 5+ years
      score += 15;
    } else if (data.domainAge >= 730) { // 2+ years
      score += 10;
    } else if (data.domainAge >= 365) { // 1+ year
      score += 5;
    } else if (data.domainAge >= 90) { // 3+ months
      score += 2;
    }

    // Archive depth (max 15 points)
    if (data.totalSnapshots >= 500) {
      score += 15;
    } else if (data.totalSnapshots >= 200) {
      score += 12;
    } else if (data.totalSnapshots >= 100) {
      score += 9;
    } else if (data.totalSnapshots >= 50) {
      score += 6;
    } else if (data.totalSnapshots >= 20) {
      score += 3;
    }

    // Consistency score contribution (max 15 points)
    score += Math.round(data.consistencyScore * 0.15);

    // Archive health (max 10 points)
    switch (data.archiveHealth) {
      case 'excellent':
        score += 10;
        break;
      case 'good':
        score += 7;
        break;
      case 'fair':
        score += 4;
        break;
      case 'poor':
        score += 2;
        break;
    }

    // Recent activity bonus (max 5 points)
    if (data.lastArchivedDate) {
      const daysSince = (Date.now() - new Date(data.lastArchivedDate)) / (1000 * 60 * 60 * 24);
      if (daysSince <= 30) {
        score += 5;
      } else if (daysSince <= 90) {
        score += 3;
      } else if (daysSince <= 180) {
        score += 1;
      }
    }

    // Yearly coverage bonus (max 5 points)
    const yearCount = Object.keys(data.yearlySnapshots).length;
    if (yearCount >= 10) {
      score += 5;
    } else if (yearCount >= 5) {
      score += 3;
    } else if (yearCount >= 2) {
      score += 1;
    }

    return Math.min(score, 80); // Cap at 80 points for archive data
  }
}

module.exports = new ArchiveService();
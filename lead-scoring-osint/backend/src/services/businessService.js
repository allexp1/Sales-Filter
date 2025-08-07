const axios = require('axios');
const logger = require('../utils/logger');

class BusinessService {
  constructor() {
    // Google Places API configuration
    this.googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.googlePlacesUrl = process.env.GOOGLE_PLACES_API_URL || 'https://maps.googleapis.com/maps/api/place';
    
    // Yelp API configuration
    this.yelpApiKey = process.env.YELP_API_KEY;
    this.yelpApiUrl = process.env.YELP_API_URL || 'https://api.yelp.com/v3';
  }

  /**
   * Lookup business information for a domain/company
   * @param {string} domain - Domain to lookup
   * @param {string} companyName - Company name (optional)
   * @param {string} location - Location hint (optional)
   * @returns {Object} Business information and score
   */
  async lookup(domain, companyName = null, location = null) {
    const results = {
      hasData: false,
      businessName: companyName || null,
      businessType: null,
      industry: null,
      address: null,
      phone: null,
      website: null,
      rating: null,
      reviewCount: 0,
      priceLevel: null,
      hours: null,
      verified: false,
      established: null,
      employees: null,
      revenue: null,
      socialProfiles: {
        facebook: null,
        twitter: null,
        linkedin: null,
        instagram: null
      },
      categories: [],
      amenities: [],
      photos: [],
      competitors: [],
      score: 0
    };

    try {
      // Determine company name from domain if not provided
      if (!companyName) {
        companyName = this.extractCompanyName(domain);
      }

      // Try Google Places first
      if (this.googleApiKey) {
        const googleData = await this.getGooglePlacesData(companyName, domain, location);
        this.mergeResults(results, googleData);
      }

      // Then try Yelp
      if (this.yelpApiKey) {
        const yelpData = await this.getYelpData(companyName, domain, location);
        this.mergeResults(results, yelpData);
      }

      // If no API keys, try basic web scraping
      if (!this.googleApiKey && !this.yelpApiKey) {
        const basicData = await this.getBasicBusinessInfo(domain, companyName);
        this.mergeResults(results, basicData);
      }

      // Calculate score based on business data
      results.score = this.calculateScore(results);
      results.hasData = results.businessName !== null || results.rating !== null;

      return results;
    } catch (error) {
      logger.error(`Business lookup failed for ${domain}:`, error);
      return results;
    }
  }

  /**
   * Get data from Google Places API
   */
  async getGooglePlacesData(companyName, domain, location) {
    const result = this.getEmptyResult();

    try {
      // First, search for the place
      const searchResponse = await axios.get(`${this.googlePlacesUrl}/findplacefromtext/json`, {
        params: {
          input: `${companyName} ${location || ''}`.trim(),
          inputtype: 'textquery',
          fields: 'place_id,name,formatted_address,types',
          key: this.googleApiKey
        }
      });

      const candidates = searchResponse.data.candidates || [];
      if (candidates.length === 0) {
        return result;
      }

      const placeId = candidates[0].place_id;
      
      // Get detailed information
      const detailsResponse = await axios.get(`${this.googlePlacesUrl}/details/json`, {
        params: {
          place_id: placeId,
          fields: 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,price_level,opening_hours,types,photos,reviews,business_status,address_components',
          key: this.googleApiKey
        }
      });

      const place = detailsResponse.data.result;
      
      if (place) {
        result.businessName = place.name;
        result.address = place.formatted_address;
        result.phone = place.formatted_phone_number;
        result.website = place.website || domain;
        result.rating = place.rating;
        result.reviewCount = place.user_ratings_total || 0;
        result.priceLevel = place.price_level;
        result.businessType = this.determineBusinessType(place.types);
        result.categories = place.types || [];
        result.verified = place.business_status === 'OPERATIONAL';
        
        // Extract hours
        if (place.opening_hours) {
          result.hours = {
            isOpen: place.opening_hours.open_now,
            weekdayText: place.opening_hours.weekday_text
          };
        }
        
        // Extract photos
        if (place.photos && place.photos.length > 0) {
          result.photos = place.photos.slice(0, 5).map(photo => ({
            reference: photo.photo_reference,
            width: photo.width,
            height: photo.height
          }));
        }

        // Extract location components
        if (place.address_components) {
          const city = place.address_components.find(c => c.types.includes('locality'));
          const state = place.address_components.find(c => c.types.includes('administrative_area_level_1'));
          const country = place.address_components.find(c => c.types.includes('country'));
          
          result.location = {
            city: city?.long_name,
            state: state?.long_name,
            country: country?.long_name
          };
        }
      }

      return result;
    } catch (error) {
      logger.debug(`Google Places lookup failed for ${companyName}:`, error.message);
      return result;
    }
  }

  /**
   * Get data from Yelp API
   */
  async getYelpData(companyName, domain, location) {
    const result = this.getEmptyResult();

    try {
      // Search for business
      const searchResponse = await axios.get(`${this.yelpApiUrl}/businesses/search`, {
        headers: {
          'Authorization': `Bearer ${this.yelpApiKey}`
        },
        params: {
          term: companyName,
          location: location || 'United States',
          limit: 5,
          sort_by: 'best_match'
        }
      });

      const businesses = searchResponse.data.businesses || [];
      
      // Find best match
      let bestMatch = null;
      for (const business of businesses) {
        // Check if domain matches
        if (business.url && business.url.includes(domain)) {
          bestMatch = business;
          break;
        }
        // Check name similarity
        if (this.isSimilarName(companyName, business.name)) {
          bestMatch = business;
          break;
        }
      }

      if (!bestMatch && businesses.length > 0) {
        bestMatch = businesses[0]; // Use first result as fallback
      }

      if (bestMatch) {
        // Get detailed information
        const detailsResponse = await axios.get(`${this.yelpApiUrl}/businesses/${bestMatch.id}`, {
          headers: {
            'Authorization': `Bearer ${this.yelpApiKey}`
          }
        });

        const business = detailsResponse.data;
        
        result.businessName = business.name;
        result.phone = business.phone;
        result.rating = business.rating;
        result.reviewCount = business.review_count || 0;
        result.priceLevel = business.price ? business.price.length : null;
        result.verified = business.is_claimed || false;
        
        // Address
        if (business.location) {
          result.address = business.location.display_address.join(', ');
          result.location = {
            city: business.location.city,
            state: business.location.state,
            country: business.location.country
          };
        }
        
        // Categories
        if (business.categories) {
          result.categories = business.categories.map(c => c.title);
          result.industry = business.categories[0]?.title;
        }
        
        // Hours
        if (business.hours && business.hours.length > 0) {
          const hours = business.hours[0];
          result.hours = {
            isOpen: hours.is_open_now,
            hoursType: hours.hours_type,
            schedule: hours.open
          };
        }
        
        // Photos
        if (business.photos) {
          result.photos = business.photos.slice(0, 5);
        }
        
        // Attributes/Amenities
        if (business.attributes) {
          result.amenities = Object.keys(business.attributes).filter(
            key => business.attributes[key] === true
          );
        }
      }

      return result;
    } catch (error) {
      logger.debug(`Yelp lookup failed for ${companyName}:`, error.message);
      return result;
    }
  }

  /**
   * Get basic business information through web scraping
   */
  async getBasicBusinessInfo(domain, companyName) {
    const result = this.getEmptyResult();

    try {
      // Try to fetch the website
      const response = await axios.get(`https://${domain}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeadScoringBot/1.0)'
        }
      });

      const html = response.data.toLowerCase();
      
      // Extract business signals from HTML
      result.businessName = companyName;
      
      // Look for business type indicators
      if (html.includes('restaurant') || html.includes('menu') || html.includes('reservation')) {
        result.businessType = 'restaurant';
        result.industry = 'Food & Beverage';
      } else if (html.includes('hotel') || html.includes('rooms') || html.includes('accommodation')) {
        result.businessType = 'hotel';
        result.industry = 'Hospitality';
      } else if (html.includes('store') || html.includes('shop') || html.includes('buy')) {
        result.businessType = 'retail';
        result.industry = 'Retail';
      } else if (html.includes('clinic') || html.includes('doctor') || html.includes('medical')) {
        result.businessType = 'medical';
        result.industry = 'Healthcare';
      }
      
      // Look for social media links
      const socialPatterns = {
        facebook: /facebook\.com\/([^\/\s]+)/,
        twitter: /twitter\.com\/([^\/\s]+)/,
        linkedin: /linkedin\.com\/(company|in)\/([^\/\s]+)/,
        instagram: /instagram\.com\/([^\/\s]+)/
      };
      
      for (const [platform, pattern] of Object.entries(socialPatterns)) {
        const match = html.match(pattern);
        if (match) {
          result.socialProfiles[platform] = match[0];
        }
      }
      
      // Look for contact information
      const phonePattern = /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/;
      const phoneMatch = html.match(phonePattern);
      if (phoneMatch) {
        result.phone = phoneMatch[1];
      }
      
      // Look for established date
      const yearPattern = /(established|founded|since)\s+(\d{4})/i;
      const yearMatch = html.match(yearPattern);
      if (yearMatch) {
        result.established = parseInt(yearMatch[2]);
      }

      return result;
    } catch (error) {
      logger.debug(`Basic business info extraction failed for ${domain}:`, error.message);
      return result;
    }
  }

  /**
   * Extract company name from domain
   */
  extractCompanyName(domain) {
    // Remove common TLDs and www
    let name = domain.replace(/^www\./, '').replace(/\.(com|org|net|io|co|biz|info).*$/, '');
    
    // Convert hyphens to spaces and capitalize
    name = name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return name;
  }

  /**
   * Check if two names are similar
   */
  isSimilarName(name1, name2) {
    const clean = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleaned1 = clean(name1);
    const cleaned2 = clean(name2);
    
    // Check if one contains the other
    return cleaned1.includes(cleaned2) || cleaned2.includes(cleaned1);
  }

  /**
   * Determine business type from Google Places types
   */
  determineBusinessType(types) {
    if (!types || types.length === 0) return null;
    
    const typeMap = {
      restaurant: ['restaurant', 'food', 'cafe', 'bar'],
      retail: ['store', 'shopping_mall', 'clothing_store', 'electronics_store'],
      service: ['lawyer', 'accounting', 'insurance_agency', 'real_estate_agency'],
      medical: ['doctor', 'dentist', 'hospital', 'pharmacy'],
      hospitality: ['lodging', 'hotel', 'motel'],
      finance: ['bank', 'atm', 'finance']
    };
    
    for (const [businessType, keywords] of Object.entries(typeMap)) {
      if (types.some(type => keywords.some(keyword => type.includes(keyword)))) {
        return businessType;
      }
    }
    
    return 'general';
  }

  /**
   * Merge results from different sources
   */
  mergeResults(target, source) {
    // Merge basic fields (prefer non-null values)
    const fields = ['businessName', 'businessType', 'industry', 'address', 'phone', 'website', 'established'];
    for (const field of fields) {
      if (!target[field] && source[field]) {
        target[field] = source[field];
      }
    }
    
    // Merge ratings (average if both exist)
    if (source.rating) {
      if (target.rating) {
        target.rating = (target.rating + source.rating) / 2;
        target.reviewCount += source.reviewCount;
      } else {
        target.rating = source.rating;
        target.reviewCount = source.reviewCount;
      }
    }
    
    // Merge verified status (true if any source says true)
    target.verified = target.verified || source.verified;
    
    // Merge arrays
    target.categories = [...new Set([...target.categories, ...source.categories])];
    target.amenities = [...new Set([...target.amenities, ...source.amenities])];
    
    // Merge social profiles
    for (const [platform, url] of Object.entries(source.socialProfiles)) {
      if (url && !target.socialProfiles[platform]) {
        target.socialProfiles[platform] = url;
      }
    }
    
    // Keep better quality data
    if (source.hours && !target.hours) {
      target.hours = source.hours;
    }
    if (source.location && !target.location) {
      target.location = source.location;
    }
    if (source.photos.length > target.photos.length) {
      target.photos = source.photos;
    }
  }

  /**
   * Calculate score based on business data
   */
  calculateScore(data) {
    let score = 0;

    // Business verification (max 10 points)
    if (data.verified) {
      score += 10;
    } else if (data.businessName) {
      score += 5;
    }

    // Online presence (max 15 points)
    if (data.rating !== null) {
      score += 5;
      // High rating bonus
      if (data.rating >= 4.5) score += 5;
      else if (data.rating >= 4.0) score += 3;
      else if (data.rating >= 3.5) score += 1;
    }

    // Review count (max 10 points)
    if (data.reviewCount > 0) {
      if (data.reviewCount >= 100) score += 10;
      else if (data.reviewCount >= 50) score += 7;
      else if (data.reviewCount >= 20) score += 5;
      else if (data.reviewCount >= 10) score += 3;
      else score += 1;
    }

    // Business maturity (max 10 points)
    if (data.established) {
      const age = new Date().getFullYear() - data.established;
      if (age >= 10) score += 10;
      else if (age >= 5) score += 7;
      else if (age >= 2) score += 4;
      else if (age >= 1) score += 2;
    }

    // Contact information (max 5 points)
    if (data.phone) score += 2;
    if (data.address) score += 3;

    // Social media presence (max 10 points)
    const socialCount = Object.values(data.socialProfiles).filter(v => v !== null).length;
    score += Math.min(socialCount * 2.5, 10);

    // Business hours (max 5 points)
    if (data.hours) {
      score += 5;
    }

    // Photos presence (max 5 points)
    if (data.photos.length > 0) {
      score += Math.min(data.photos.length, 5);
    }

    // Industry/Category clarity (max 5 points)
    if (data.industry || data.businessType) {
      score += 3;
    }
    if (data.categories.length >= 2) {
      score += 2;
    }

    // Price level (for applicable businesses)
    if (data.priceLevel !== null) {
      // Mid to high price levels indicate established business
      if (data.priceLevel >= 3) score += 3;
      else if (data.priceLevel >= 2) score += 2;
    }

    return Math.min(score, 75); // Cap at 75 points for business info
  }

  /**
   * Get empty result structure
   */
  getEmptyResult() {
    return {
      businessName: null,
      businessType: null,
      industry: null,
      address: null,
      phone: null,
      website: null,
      rating: null,
      reviewCount: 0,
      priceLevel: null,
      hours: null,
      verified: false,
      established: null,
      employees: null,
      revenue: null,
      socialProfiles: {
        facebook: null,
        twitter: null,
        linkedin: null,
        instagram: null
      },
      categories: [],
      amenities: [],
      photos: [],
      location: null
    };
  }
}

module.exports = new BusinessService();
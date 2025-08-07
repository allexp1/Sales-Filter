const axios = require('axios');
const logger = require('../utils/logger');

class GitHubService {
  constructor() {
    this.apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
    this.token = process.env.GITHUB_TOKEN;
    this.headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Lead-Scoring-OSINT'
    };
    
    if (this.token) {
      this.headers['Authorization'] = `token ${this.token}`;
    }
  }

  /**
   * Search GitHub for company/developer presence
   * @param {string} domain - Domain to search
   * @param {string} companyName - Company name
   * @param {string} email - Email address (optional)
   * @returns {Object} GitHub presence data and score
   */
  async lookup(domain, companyName, email = null) {
    const results = {
      hasData: false,
      hasOrganization: false,
      hasRepositories: false,
      organizationData: null,
      repositoryCount: 0,
      publicRepos: [],
      totalStars: 0,
      totalForks: 0,
      totalWatchers: 0,
      languages: [],
      topics: [],
      contributors: 0,
      lastActivityDate: null,
      createdDate: null,
      developmentActivity: {
        commits: 0,
        issues: 0,
        pullRequests: 0,
        releases: 0
      },
      techStack: [],
      openSourceContributions: 0,
      developerProfiles: [],
      score: 0
    };

    try {
      // Search for organization
      const orgData = await this.searchOrganization(companyName, domain);
      if (orgData) {
        results.hasOrganization = true;
        results.organizationData = orgData;
        results.hasData = true;
      }

      // Search for repositories
      const repoData = await this.searchRepositories(companyName, domain);
      if (repoData.repositories.length > 0) {
        results.hasRepositories = true;
        results.publicRepos = repoData.repositories;
        results.repositoryCount = repoData.total;
        results.totalStars = repoData.totalStars;
        results.totalForks = repoData.totalForks;
        results.languages = repoData.languages;
        results.topics = repoData.topics;
        results.lastActivityDate = repoData.lastActivity;
        results.hasData = true;
      }

      // Search for developer profiles if email provided
      if (email) {
        const devProfiles = await this.searchDevelopersByEmail(email, domain);
        if (devProfiles.length > 0) {
          results.developerProfiles = devProfiles;
          results.hasData = true;
        }
      }

      // Analyze development activity
      if (results.publicRepos.length > 0) {
        const activityData = await this.analyzeActivity(results.publicRepos);
        results.developmentActivity = activityData.activity;
        results.contributors = activityData.contributors;
        results.techStack = activityData.techStack;
      }

      // Calculate score
      results.score = this.calculateScore(results);

      return results;
    } catch (error) {
      logger.error(`GitHub lookup failed for ${domain}:`, error);
      return results;
    }
  }

  /**
   * Search for organization on GitHub
   */
  async searchOrganization(companyName, domain) {
    try {
      // Clean company name for search
      const searchName = companyName.replace(/\s+/g, '-').toLowerCase();
      
      // Try direct organization lookup first
      try {
        const directResponse = await axios.get(
          `${this.apiUrl}/orgs/${searchName}`,
          { headers: this.headers }
        );

        const org = directResponse.data;
        if (org && this.isRelevantOrg(org, domain, companyName)) {
          return this.extractOrgData(org);
        }
      } catch (error) {
        // Direct lookup failed, try search
      }

      // Search for organization
      const searchResponse = await axios.get(
        `${this.apiUrl}/search/users`,
        {
          headers: this.headers,
          params: {
            q: `${companyName} type:org`,
            sort: 'followers',
            order: 'desc',
            per_page: 10
          }
        }
      );

      const orgs = searchResponse.data.items || [];
      
      // Find best matching organization
      for (const org of orgs) {
        if (this.isRelevantOrg(org, domain, companyName)) {
          // Get full organization details
          const fullOrgResponse = await axios.get(org.url, { headers: this.headers });
          return this.extractOrgData(fullOrgResponse.data);
        }
      }

      return null;
    } catch (error) {
      logger.debug(`GitHub organization search failed for ${companyName}:`, error.message);
      return null;
    }
  }

  /**
   * Search for repositories
   */
  async searchRepositories(companyName, domain) {
    const result = {
      repositories: [],
      total: 0,
      totalStars: 0,
      totalForks: 0,
      languages: new Set(),
      topics: new Set(),
      lastActivity: null
    };

    try {
      // Search repositories by company name
      const searchResponse = await axios.get(
        `${this.apiUrl}/search/repositories`,
        {
          headers: this.headers,
          params: {
            q: `${companyName} in:name,description`,
            sort: 'stars',
            order: 'desc',
            per_page: 30
          }
        }
      );

      const repos = searchResponse.data.items || [];
      result.total = searchResponse.data.total_count || 0;

      // Filter and analyze repositories
      const relevantRepos = repos.filter(repo => 
        this.isRelevantRepo(repo, domain, companyName)
      );

      for (const repo of relevantRepos.slice(0, 10)) {
        // Get detailed repo info
        const repoDetails = await this.getRepositoryDetails(repo.full_name);
        if (repoDetails) {
          result.repositories.push(repoDetails);
          result.totalStars += repoDetails.stars;
          result.totalForks += repoDetails.forks;
          
          // Collect languages
          if (repoDetails.language) {
            result.languages.add(repoDetails.language);
          }
          
          // Collect topics
          repoDetails.topics.forEach(topic => result.topics.add(topic));
          
          // Track latest activity
          const activityDate = new Date(repoDetails.lastActivity);
          if (!result.lastActivity || activityDate > result.lastActivity) {
            result.lastActivity = activityDate;
          }
        }
      }

      // Convert sets to arrays
      result.languages = Array.from(result.languages);
      result.topics = Array.from(result.topics);

      return result;
    } catch (error) {
      logger.debug(`GitHub repository search failed for ${companyName}:`, error.message);
      return result;
    }
  }

  /**
   * Get detailed repository information
   */
  async getRepositoryDetails(fullName) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/repos/${fullName}`,
        { headers: this.headers }
      );

      const repo = response.data;
      
      // Get languages
      const langResponse = await axios.get(repo.languages_url, { headers: this.headers });
      const languages = Object.keys(langResponse.data);

      return {
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        homepage: repo.homepage,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        watchers: repo.watchers_count,
        language: repo.language,
        languages: languages,
        topics: repo.topics || [],
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        lastActivity: repo.pushed_at || repo.updated_at,
        openIssues: repo.open_issues_count,
        license: repo.license?.name,
        archived: repo.archived,
        size: repo.size
      };
    } catch (error) {
      logger.debug(`Failed to get repository details for ${fullName}:`, error.message);
      return null;
    }
  }

  /**
   * Search for developers by email
   */
  async searchDevelopersByEmail(email, domain) {
    const profiles = [];

    try {
      // Extract username from email
      const [username] = email.split('@');
      
      // Search users
      const searchResponse = await axios.get(
        `${this.apiUrl}/search/users`,
        {
          headers: this.headers,
          params: {
            q: `${username} in:login,name,email`,
            per_page: 10
          }
        }
      );

      const users = searchResponse.data.items || [];
      
      for (const user of users.slice(0, 5)) {
        // Get full user profile
        const profileResponse = await axios.get(user.url, { headers: this.headers });
        const profile = profileResponse.data;
        
        // Check if profile is relevant (email domain match or company match)
        if (profile.email && profile.email.includes(domain) || 
            profile.company && this.isSimilarName(profile.company, domain)) {
          
          profiles.push({
            login: profile.login,
            name: profile.name,
            email: profile.email,
            company: profile.company,
            location: profile.location,
            bio: profile.bio,
            publicRepos: profile.public_repos,
            followers: profile.followers,
            following: profile.following,
            createdAt: profile.created_at,
            hireable: profile.hireable,
            blog: profile.blog,
            profileUrl: profile.html_url
          });
        }
      }

      return profiles;
    } catch (error) {
      logger.debug(`GitHub developer search failed for ${email}:`, error.message);
      return profiles;
    }
  }

  /**
   * Analyze development activity across repositories
   */
  async analyzeActivity(repositories) {
    const result = {
      activity: {
        commits: 0,
        issues: 0,
        pullRequests: 0,
        releases: 0
      },
      contributors: new Set(),
      techStack: []
    };

    try {
      // Analyze top 5 repositories
      for (const repo of repositories.slice(0, 5)) {
        // Get recent commits
        try {
          const commitsResponse = await axios.get(
            `${this.apiUrl}/repos/${repo.fullName}/commits`,
            {
              headers: this.headers,
              params: {
                since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Last 90 days
                per_page: 100
              }
            }
          );
          result.activity.commits += commitsResponse.data.length;
          
          // Collect contributors
          commitsResponse.data.forEach(commit => {
            if (commit.author) {
              result.contributors.add(commit.author.login);
            }
          });
        } catch (error) {
          logger.debug(`Failed to get commits for ${repo.fullName}`);
        }

        // Count issues
        result.activity.issues += repo.openIssues || 0;

        // Get releases
        try {
          const releasesResponse = await axios.get(
            `${this.apiUrl}/repos/${repo.fullName}/releases`,
            {
              headers: this.headers,
              params: { per_page: 10 }
            }
          );
          result.activity.releases += releasesResponse.data.length;
        } catch (error) {
          logger.debug(`Failed to get releases for ${repo.fullName}`);
        }

        // Analyze tech stack from languages and topics
        repo.languages.forEach(lang => {
          if (!result.techStack.includes(lang)) {
            result.techStack.push(lang);
          }
        });
      }

      result.contributors = result.contributors.size;

      return result;
    } catch (error) {
      logger.error('Failed to analyze GitHub activity:', error);
      return result;
    }
  }

  /**
   * Check if organization is relevant
   */
  isRelevantOrg(org, domain, companyName) {
    // Check website/blog
    if (org.blog && org.blog.includes(domain)) {
      return true;
    }
    
    // Check email
    if (org.email && org.email.includes(domain)) {
      return true;
    }
    
    // Check name similarity
    return this.isSimilarName(org.login, companyName) || 
           this.isSimilarName(org.name || '', companyName);
  }

  /**
   * Check if repository is relevant
   */
  isRelevantRepo(repo, domain, companyName) {
    // Check homepage
    if (repo.homepage && repo.homepage.includes(domain)) {
      return true;
    }
    
    // Check owner
    if (this.isSimilarName(repo.owner.login, companyName)) {
      return true;
    }
    
    // Check repo name
    if (this.isSimilarName(repo.name, companyName)) {
      return true;
    }
    
    // Check description
    if (repo.description && repo.description.toLowerCase().includes(companyName.toLowerCase())) {
      return true;
    }
    
    return false;
  }

  /**
   * Check name similarity
   */
  isSimilarName(name1, name2) {
    const clean = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleaned1 = clean(name1);
    const cleaned2 = clean(name2);
    
    return cleaned1.includes(cleaned2) || cleaned2.includes(cleaned1);
  }

  /**
   * Extract organization data
   */
  extractOrgData(org) {
    return {
      login: org.login,
      name: org.name,
      description: org.description,
      blog: org.blog,
      location: org.location,
      email: org.email,
      verified: org.verified_by_github || false,
      publicRepos: org.public_repos,
      followers: org.followers,
      following: org.following,
      createdAt: org.created_at,
      type: org.type,
      htmlUrl: org.html_url,
      avatarUrl: org.avatar_url
    };
  }

  /**
   * Calculate score based on GitHub presence
   */
  calculateScore(data) {
    let score = 0;

    // Organization presence (max 15 points)
    if (data.hasOrganization) {
      score += 10;
      if (data.organizationData.verified) {
        score += 5;
      }
    }

    // Repository activity (max 30 points)
    if (data.hasRepositories) {
      score += 5;
      
      // Repository count
      if (data.repositoryCount >= 10) score += 10;
      else if (data.repositoryCount >= 5) score += 7;
      else if (data.repositoryCount >= 2) score += 4;
      
      // Stars (popularity)
      if (data.totalStars >= 1000) score += 10;
      else if (data.totalStars >= 100) score += 7;
      else if (data.totalStars >= 10) score += 4;
      else if (data.totalStars > 0) score += 2;
      
      // Forks (community engagement)
      if (data.totalForks >= 100) score += 5;
      else if (data.totalForks >= 10) score += 3;
      else if (data.totalForks > 0) score += 1;
    }

    // Development activity (max 20 points)
    const activity = data.developmentActivity;
    if (activity.commits >= 100) score += 10;
    else if (activity.commits >= 50) score += 7;
    else if (activity.commits >= 10) score += 4;
    else if (activity.commits > 0) score += 2;

    // Releases indicate mature projects
    if (activity.releases >= 10) score += 5;
    else if (activity.releases >= 5) score += 3;
    else if (activity.releases > 0) score += 1;

    // Contributors (team size)
    if (data.contributors >= 10) score += 5;
    else if (data.contributors >= 5) score += 3;
    else if (data.contributors >= 2) score += 1;

    // Technology diversity (max 10 points)
    if (data.languages.length >= 5) score += 5;
    else if (data.languages.length >= 3) score += 3;
    else if (data.languages.length >= 1) score += 1;

    // Modern tech stack bonus
    const modernLanguages = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Swift', 'Kotlin'];
    const hasModernStack = data.languages.some(lang => modernLanguages.includes(lang));
    if (hasModernStack) score += 5;

    // Recent activity (max 10 points)
    if (data.lastActivityDate) {
      const daysSinceActivity = (Date.now() - new Date(data.lastActivityDate)) / (1000 * 60 * 60 * 24);
      if (daysSinceActivity <= 7) score += 10;
      else if (daysSinceActivity <= 30) score += 7;
      else if (daysSinceActivity <= 90) score += 4;
      else if (daysSinceActivity <= 180) score += 2;
    }

    // Developer profiles (max 5 points)
    if (data.developerProfiles.length > 0) {
      score += Math.min(data.developerProfiles.length * 2, 5);
    }

    // Age bonus (established presence)
    if (data.organizationData?.createdAt) {
      const ageInDays = (Date.now() - new Date(data.organizationData.createdAt)) / (1000 * 60 * 60 * 24);
      if (ageInDays > 1095) score += 5; // 3+ years
      else if (ageInDays > 365) score += 3; // 1+ year
      else if (ageInDays > 90) score += 1; // 3+ months
    }

    return Math.min(score, 100); // Cap at 100 points
  }
}

module.exports = new GitHubService();
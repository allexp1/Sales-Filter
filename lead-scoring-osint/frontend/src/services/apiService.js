const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010/api';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async request(url, options = {}) {
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    };

    const response = await fetch(`${this.baseURL}${url}`, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints
  async login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async signup(email, password, company) {
    return this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, company }),
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // Jobs endpoints
  async getJobs() {
    return this.request('/jobs');
  }

  async getJob(jobId) {
    return this.request(`/jobs/${jobId}`);
  }

  async getJobStats() {
    return this.request('/jobs/stats');
  }

  async downloadJob(jobId) {
    const response = await fetch(`${this.baseURL}/jobs/${jobId}/download`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }

    return response.blob();
  }

  // Upload endpoints
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseURL}/upload`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || 'Upload failed');
    }

    return response.json();
  }

  async downloadTemplate() {
    const response = await fetch(`${this.baseURL}/upload/template`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to download template: ${response.statusText}`);
    }

    return response.blob();
  }

  // Payment endpoints
  async createCheckoutSession(priceId) {
    return this.request('/payments/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });
  }

  async createPortalSession() {
    return this.request('/payments/create-portal-session', {
      method: 'POST',
    });
  }

  async cancelSubscription() {
    return this.request('/payments/cancel-subscription', {
      method: 'POST',
    });
  }

  async getSubscriptionStatus() {
    return this.request('/payments/subscription-status');
  }
}

export default new ApiService();
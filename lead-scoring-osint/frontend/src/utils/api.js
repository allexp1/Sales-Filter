const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Custom error class for API errors
export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// Main API request function with error handling and token refresh
export const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    let response = await fetch(url, defaultOptions);
    
    // Handle token refresh if needed
    if (response.status === 401 && endpoint !== '/auth/refresh') {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            const newToken = refreshData.token;
            localStorage.setItem('token', newToken);
            
            // Retry original request with new token
            defaultOptions.headers.Authorization = `Bearer ${newToken}`;
            response = await fetch(url, defaultOptions);
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          localStorage.removeItem('token');
          throw new ApiError('Session expired. Please log in again.', 401);
        }
      }
    }

    // Handle non-JSON responses (like file downloads)
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.blob();
    }

    if (!response.ok) {
      const errorMessage = data.error || data.message || `HTTP error! status: ${response.status}`;
      throw new ApiError(
        errorMessage,
        response.status,
        data.details || null
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network or other fetch errors
    throw new ApiError(
      error.message || 'Network error occurred',
      0,
      { originalError: error }
    );
  }
};

// Authenticated request helper
export const authenticatedRequest = (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  return apiRequest(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
};

// File upload helper with progress tracking
export const uploadFile = async (endpoint, file, onProgress = null) => {
  const token = localStorage.getItem('token');
  const url = `${API_BASE_URL}${endpoint}`;
  
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percentComplete = (event.loaded / event.total) * 100;
        onProgress(percentComplete);
      }
    };
    
    xhr.onload = () => {
      try {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } else {
          const error = JSON.parse(xhr.responseText);
          reject(new ApiError(
            error.error || error.message || `HTTP error! status: ${xhr.status}`,
            xhr.status,
            error.details
          ));
        }
      } catch (parseError) {
        reject(new ApiError(
          'Failed to parse server response',
          xhr.status,
          { originalError: parseError }
        ));
      }
    };
    
    xhr.onerror = () => {
      reject(new ApiError('Network error during file upload', 0));
    };
    
    xhr.open('POST', url);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    
    xhr.send(formData);
  });
};

// Download file helper
export const downloadFile = async (endpoint, filename = null) => {
  try {
    const blob = await authenticatedRequest(endpoint, {
      method: 'GET',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `download-${Date.now()}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return { success: true };
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
};

// WebSocket connection helper for real-time updates
export const createWebSocketConnection = (endpoint, token) => {
  const wsUrl = `${API_BASE_URL.replace(/^http/, 'ws')}${endpoint}`;
  const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
  
  return ws;
};

// Utility function to format API errors for display
export const formatApiError = (error) => {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      status: error.status,
      details: error.details
    };
  }
  
  return {
    message: error.message || 'An unexpected error occurred',
    status: 0,
    details: null
  };
};

// Helper for query string building
export const buildQueryString = (params) => {
  const query = new URLSearchParams();
  
  Object.keys(params).forEach(key => {
    const value = params[key];
    if (value !== null && value !== undefined && value !== '') {
      query.append(key, value.toString());
    }
  });
  
  return query.toString();
};

// API endpoints constants
export const API_ENDPOINTS = {
  // Auth endpoints
  AUTH_LOGIN: '/auth/login',
  AUTH_SIGNUP: '/auth/signup',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_VERIFY: '/auth/verify',
  AUTH_FORGOT_PASSWORD: '/auth/forgot-password',
  AUTH_RESET_PASSWORD: '/auth/reset-password',
  AUTH_ME: '/auth/me',
  
  // Job endpoints
  JOBS: '/jobs',
  JOBS_UPLOAD: '/upload',
  JOBS_STATUS: (id) => `/jobs/${id}/status`,
  JOBS_RESULTS: (id) => `/jobs/${id}/results`,
  JOBS_DOWNLOAD: (id) => `/jobs/${id}/download`,
  JOBS_LOGS: (id) => `/jobs/${id}/logs`,
  
  // Payment endpoints
  PAYMENTS_CREATE_SUBSCRIPTION: '/payments/create-subscription',
  PAYMENTS_CANCEL_SUBSCRIPTION: '/payments/cancel-subscription',
  PAYMENTS_UPDATE_PAYMENT_METHOD: '/payments/update-payment-method',
  PAYMENTS_BILLING_PORTAL: '/payments/billing-portal',
  
  // Webhook endpoints
  WEBHOOKS_STRIPE: '/webhooks/stripe',
  
  // Health check
  HEALTH: '/health',
};
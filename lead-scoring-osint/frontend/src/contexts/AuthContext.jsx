import React, { createContext, useContext, useState, useEffect } from 'react';
import apiService from '../services/apiService';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const navigate = useNavigate();

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Verify token and get user info
      const response = await apiService.get('/api/auth/me');
      if (response.data.user) {
        setUser(response.data.user);
        setSubscription(response.data.subscription);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Token might be invalid, clear it
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await apiService.post('/api/auth/login', {
        email,
        password
      });

      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
        setSubscription(response.data.subscription);
        
        // Set default authorization header for future requests
        apiService.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        
        return { success: true };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  };

  const signup = async (userData) => {
    try {
      const response = await apiService.post('/api/auth/signup', userData);

      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
        setSubscription(response.data.subscription);
        
        // Set default authorization header for future requests
        apiService.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        
        return { success: true };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Signup failed'
      };
    }
  };

  const logout = async () => {
    try {
      // Optional: Call logout endpoint to invalidate token on server
      await apiService.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state and storage
      localStorage.removeItem('token');
      delete apiService.defaults.headers.common['Authorization'];
      setUser(null);
      setSubscription(null);
      navigate('/login');
      toast.success('Logged out successfully');
    }
  };

  const updateSubscription = (newSubscription) => {
    setSubscription(newSubscription);
  };

  const hasActiveSubscription = () => {
    return subscription && subscription.status === 'active';
  };

  const canAccessFeature = (feature) => {
    if (!hasActiveSubscription()) return false;
    
    // Check if the user's plan includes the feature
    const planFeatures = {
      starter: ['basic_osint', 'excel_export'],
      professional: ['basic_osint', 'advanced_osint', 'excel_export', 'api_access', 'custom_scoring'],
      enterprise: ['basic_osint', 'advanced_osint', 'excel_export', 'api_access', 'custom_scoring', 'custom_integrations']
    };
    
    const userPlan = subscription?.plan_id || 'starter';
    return planFeatures[userPlan]?.includes(feature) || false;
  };

  const value = {
    user,
    subscription,
    loading,
    login,
    signup,
    logout,
    checkAuth,
    updateSubscription,
    hasActiveSubscription,
    canAccessFeature
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
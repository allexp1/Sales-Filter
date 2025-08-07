import React from 'react';
import io from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    if (this.socket) {
      return this.socket;
    }

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    
    this.socket = io(API_URL, {
      auth: {
        token
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.emit('disconnected', reason);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  subscribeToJob(jobId) {
    if (!this.socket) {
      console.error('WebSocket not connected');
      return;
    }

    this.socket.emit('subscribe-job', jobId);
  }

  unsubscribeFromJob(jobId) {
    if (!this.socket) {
      return;
    }

    this.socket.emit('unsubscribe-job', jobId);
  }

  on(event, callback) {
    if (!this.socket) {
      console.error('WebSocket not connected');
      return;
    }

    // Store listener reference
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    this.socket.on(event, callback);
  }

  off(event, callback) {
    if (!this.socket) {
      return;
    }

    this.socket.off(event, callback);

    // Remove from listeners
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
      if (this.listeners.get(event).size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit(event, data) {
    if (!this.socket) {
      console.error('WebSocket not connected');
      return;
    }

    this.socket.emit(event, data);
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

// React hook for WebSocket
export const useWebSocket = (jobId, token) => {
  const [status, setStatus] = React.useState(null);
  const [updates, setUpdates] = React.useState([]);
  const [isConnected, setIsConnected] = React.useState(false);

  React.useEffect(() => {
    if (!token || !jobId) return;

    const socket = websocketService.connect(token);
    
    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => setIsConnected(false);
    
    const handleJobStatus = (data) => {
      setStatus(data);
    };

    const handleJobUpdate = (update) => {
      setUpdates(prev => [...prev, update]);
      
      if (update.type === 'progress') {
        setStatus(prev => ({
          ...prev,
          progress: update.progress,
          processed_leads: update.processedLeads,
          total_leads: update.totalLeads
        }));
      } else if (update.type === 'status') {
        setStatus(prev => ({
          ...prev,
          status: update.status
        }));
      } else if (update.type === 'complete') {
        setStatus(prev => ({
          ...prev,
          status: 'completed',
          ...update.results
        }));
      } else if (update.type === 'error') {
        setStatus(prev => ({
          ...prev,
          status: 'failed',
          error_message: update.error
        }));
      }
    };

    websocketService.on('connected', handleConnected);
    websocketService.on('disconnected', handleDisconnected);
    websocketService.on('job-status', handleJobStatus);
    websocketService.on('job-update', handleJobUpdate);
    
    websocketService.subscribeToJob(jobId);

    return () => {
      websocketService.unsubscribeFromJob(jobId);
      websocketService.off('connected', handleConnected);
      websocketService.off('disconnected', handleDisconnected);
      websocketService.off('job-status', handleJobStatus);
      websocketService.off('job-update', handleJobUpdate);
    };
  }, [jobId, token]);

  return { status, updates, isConnected };
};

export default websocketService;
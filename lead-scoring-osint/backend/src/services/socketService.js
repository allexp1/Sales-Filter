const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const db = require('../models/database');

class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // Map userId to socket IDs
  }

  initialize(server) {
    this.io = socketIo(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true
      }
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.get('SELECT id, email FROM users WHERE id = ?', [decoded.userId]);
        
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.userId = user.id;
        socket.userEmail = user.email;
        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication error'));
      }
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      logger.info(`User ${socket.userId} connected via WebSocket`);
      
      // Add socket to user's socket list
      if (!this.userSockets.has(socket.userId)) {
        this.userSockets.set(socket.userId, new Set());
      }
      this.userSockets.get(socket.userId).add(socket.id);

      // Join user-specific room
      socket.join(`user-${socket.userId}`);

      // Handle job subscription
      socket.on('subscribe-job', async (jobId) => {
        try {
          // Verify user owns the job
          const job = await db.get(
            'SELECT id FROM jobs WHERE id = ? AND user_id = ?',
            [jobId, socket.userId]
          );
          
          if (job) {
            socket.join(`job-${jobId}`);
            logger.debug(`User ${socket.userId} subscribed to job ${jobId}`);
            
            // Send current job status
            const jobStatus = await this.getJobStatus(jobId);
            socket.emit('job-status', jobStatus);
          } else {
            socket.emit('error', { message: 'Job not found or access denied' });
          }
        } catch (error) {
          logger.error('Error subscribing to job:', error);
          socket.emit('error', { message: 'Failed to subscribe to job' });
        }
      });

      // Handle job unsubscription
      socket.on('unsubscribe-job', (jobId) => {
        socket.leave(`job-${jobId}`);
        logger.debug(`User ${socket.userId} unsubscribed from job ${jobId}`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`User ${socket.userId} disconnected`);
        
        // Remove socket from user's socket list
        const userSocketSet = this.userSockets.get(socket.userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            this.userSockets.delete(socket.userId);
          }
        }
      });
    });

    logger.info('WebSocket service initialized');
  }

  /**
   * Emit job update to specific job room
   */
  emitJobUpdate(jobId, update) {
    if (this.io) {
      this.io.to(`job-${jobId}`).emit('job-update', {
        jobId,
        ...update,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Emit job progress update
   */
  emitJobProgress(jobId, progress, processedLeads, totalLeads) {
    this.emitJobUpdate(jobId, {
      type: 'progress',
      progress,
      processedLeads,
      totalLeads
    });
  }

  /**
   * Emit job status change
   */
  emitJobStatusChange(jobId, status, message = null) {
    this.emitJobUpdate(jobId, {
      type: 'status',
      status,
      message
    });
  }

  /**
   * Emit job log entry
   */
  emitJobLog(jobId, level, message) {
    this.emitJobUpdate(jobId, {
      type: 'log',
      log: {
        level,
        message,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Emit job completion
   */
  emitJobComplete(jobId, results) {
    this.emitJobUpdate(jobId, {
      type: 'complete',
      status: 'completed',
      results: {
        totalLeads: results.totalLeads,
        enrichedLeads: results.enrichedLeads,
        highScoreLeads: results.highScoreLeads,
        resultsFilename: results.resultsFilename
      }
    });
  }

  /**
   * Emit job error
   */
  emitJobError(jobId, error) {
    this.emitJobUpdate(jobId, {
      type: 'error',
      status: 'failed',
      error: error.message || 'Unknown error occurred'
    });
  }

  /**
   * Emit notification to specific user
   */
  emitToUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user-${userId}`).emit(event, data);
    }
  }

  /**
   * Get current job status from database
   */
  async getJobStatus(jobId) {
    try {
      const job = await db.get(
        `SELECT status, progress, total_leads, processed_leads, 
                enriched_leads, high_score_leads, error_message
         FROM jobs WHERE id = ?`,
        [jobId]
      );

      if (!job) {
        return null;
      }

      // Get recent logs
      const logs = await db.all(
        'SELECT level, message, timestamp FROM job_logs WHERE job_id = ? ORDER BY timestamp DESC LIMIT 5',
        [jobId]
      );

      return {
        jobId,
        ...job,
        recentLogs: logs
      };
    } catch (error) {
      logger.error('Error getting job status:', error);
      return null;
    }
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId) {
    return this.userSockets.has(userId);
  }

  /**
   * Get number of connected users
   */
  getConnectedUsersCount() {
    return this.userSockets.size;
  }

  /**
   * Get socket instance
   */
  getIo() {
    return this.io;
  }
}

// Create singleton instance
const socketService = new SocketService();
module.exports = socketService;
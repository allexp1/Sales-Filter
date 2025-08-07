const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const jobRoutes = require('./routes/jobs');
const paymentRoutes = require('./routes/payments');
const webhookRoutes = require('./routes/webhooks');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

// Import database
const db = require('./models/database');

// Import logger
const logger = require('./utils/logger');

// Import socket service
const socketService = require('./services/socketService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3001', 'http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/processed', express.static(path.join(__dirname, '../processed')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', authenticateToken, uploadRoutes);
app.use('/api/jobs', authenticateToken, jobRoutes);
app.use('/api/payments', authenticateToken, paymentRoutes);
app.use('/api/webhooks', webhookRoutes);

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    api: 'Lead Scoring & OSINT Enrichment API',
    version: '1.0.0',
    status: 'operational',
    services: {
      database: db ? 'connected' : 'disconnected',
      redis: 'connected', // TODO: Add Redis health check
      websocket: socketService.getConnectedUsersCount() >= 0 ? 'operational' : 'disconnected',
      osint_services: {
        whois: !!process.env.WHOIS_API_KEY,
        dns_history: !!process.env.SECURITYTRAILS_API_KEY,
        ssl_certs: true, // crt.sh is free
        tech_stack: !!process.env.BUILTWITH_API_KEY || !!process.env.WAPPALYZER_API_KEY,
        traffic_estimates: !!process.env.SIMILARWEB_API_KEY,
        business_info: !!process.env.GOOGLE_MAPS_API_KEY || !!process.env.YELP_API_KEY,
        email_risk: !!process.env.HIBP_API_KEY || !!process.env.HUNTER_API_KEY,
        github_search: !!process.env.GITHUB_TOKEN,
        archives: true, // Wayback Machine is free
        security_scans: !!process.env.SHODAN_API_KEY || !!process.env.CENSYS_API_ID
      }
    },
    websocket: {
      connected_users: socketService.getConnectedUsersCount()
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Error handling middleware
app.use(errorHandler);

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database
    await db.initialize();
    logger.info('Database initialized successfully');

    // Initialize WebSocket service
    socketService.initialize(server);
    logger.info('WebSocket service initialized');

    // Start server
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API status: http://localhost:${PORT}/api/status`);
      logger.info(`WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

startServer();

module.exports = app;
const jwt = require('jsonwebtoken');
const db = require('../models/database');
const logger = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      subscriptionType: user.subscription_type,
      creditsRemaining: user.credits_remaining
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const requireSubscription = (requiredType = 'premium') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.subscriptionType !== requiredType && requiredType !== 'free') {
      return res.status(403).json({ 
        error: `${requiredType} subscription required`,
        currentSubscription: req.user.subscriptionType
      });
    }

    next();
  };
};

const checkCredits = (requiredCredits = 1) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.creditsRemaining < requiredCredits) {
      return res.status(403).json({ 
        error: 'Insufficient credits',
        creditsRemaining: req.user.creditsRemaining,
        creditsRequired: requiredCredits
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireSubscription,
  checkCredits
};
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { ValidationError, ConflictError, UnauthorizedError } = require('../middleware/errorHandler');

const router = express.Router();

// Validation rules
const signupValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  body('firstName').trim().isLength({ min: 1, max: 50 }),
  body('lastName').trim().isLength({ min: 1, max: 50 }),
  body('company').optional().trim().isLength({ max: 100 }),
  body('industry').optional().trim().isLength({ max: 50 })
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
];

// Generate JWT token
const generateToken = (userId, email) => {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// POST /api/auth/signup
router.post('/signup', signupValidation, async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid input data', errors.array());
    }

    const { email, password, firstName, lastName, company, industry } = req.body;

    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await db.run(
      `INSERT INTO users (email, password_hash, first_name, last_name, company, industry) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, firstName, lastName, company || null, industry || null]
    );

    // Generate token
    const token = generateToken(result.id, email);

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: result.id,
        email,
        firstName,
        lastName,
        company,
        industry,
        subscriptionType: 'free',
        creditsRemaining: 100
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', loginValidation, async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid input data', errors.array());
    }

    const { email, password } = req.body;

    // Get user from database
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate token
    const token = generateToken(user.id, user.email);

    // Update last login
    await db.run('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    logger.info(`User logged in: ${email}`);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        company: user.company,
        industry: user.industry,
        subscriptionType: user.subscription_type,
        creditsRemaining: user.credits_remaining
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/verify
router.post('/verify', async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        company: user.company,
        industry: user.industry,
        subscriptionType: user.subscription_type,
        creditsRemaining: user.credits_remaining
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.json({ valid: false, error: 'Invalid or expired token' });
    } else {
      next(error);
    }
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Generate new token
    const newToken = generateToken(user.id, user.email);

    res.json({
      message: 'Token refreshed successfully',
      token: newToken
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
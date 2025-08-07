const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { body, validationResult } = require('express-validator');
const db = require('../models/database');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// POST /api/payments/create-intent
router.post('/create-intent', [
  body('amount').isInt({ min: 1 }),
  body('currency').isLength({ min: 3, max: 3 }),
  body('jobId').optional().isInt()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid payment data', errors.array());
    }

    const { amount, currency = 'usd', jobId } = req.body;

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata: {
        userId: req.user.id,
        jobId: jobId || '',
      },
    });

    // Update job with payment intent if jobId provided
    if (jobId) {
      const job = await db.get('SELECT id FROM jobs WHERE id = ? AND user_id = ?', [jobId, req.user.id]);
      if (!job) {
        throw new NotFoundError('Job not found');
      }
      
      await db.run(
        'UPDATE jobs SET payment_intent_id = ? WHERE id = ?',
        [paymentIntent.id, jobId]
      );
    }

    logger.info(`Payment intent created: ${paymentIntent.id} for user ${req.user.id}`);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/intent/:id
router.get('/intent/:id', async (req, res, next) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(req.params.id);
    
    // Verify the payment intent belongs to the user
    if (paymentIntent.metadata.userId !== req.user.id.toString()) {
      throw new NotFoundError('Payment intent not found');
    }

    res.json({
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/confirm
router.post('/confirm', [
  body('paymentIntentId').isLength({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid confirmation data', errors.array());
    }

    const { paymentIntentId } = req.body;

    // Retrieve payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    // Verify ownership
    if (paymentIntent.metadata.userId !== req.user.id.toString()) {
      throw new NotFoundError('Payment intent not found');
    }

    if (paymentIntent.status === 'succeeded') {
      // Update job payment status
      if (paymentIntent.metadata.jobId) {
        await db.run(
          'UPDATE jobs SET amount_paid = ? WHERE payment_intent_id = ?',
          [paymentIntent.amount, paymentIntentId]
        );
      }

      // Update user credits or subscription
      await db.run(
        'UPDATE users SET credits_remaining = credits_remaining + ? WHERE id = ?',
        [Math.floor(paymentIntent.amount / 100), req.user.id] // 1 credit per cent
      );

      logger.info(`Payment confirmed: ${paymentIntentId} for user ${req.user.id}`);
    }

    res.json({
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/history
router.get('/history', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Get payment history from jobs table
    const payments = await db.all(
      `SELECT j.id, j.original_filename, j.amount_paid, j.payment_intent_id, j.created_at
       FROM jobs j 
       WHERE j.user_id = ? AND j.amount_paid > 0 
       ORDER BY j.created_at DESC 
       LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );

    const total = await db.get(
      'SELECT COUNT(*) as count FROM jobs WHERE user_id = ? AND amount_paid > 0',
      [req.user.id]
    );

    res.json({
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total.count,
        pages: Math.ceil(total.count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/pricing
router.get('/pricing', (req, res) => {
  res.json({
    plans: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'usd',
        interval: 'month',
        credits: 100,
        features: [
          'Basic OSINT enrichment',
          'Up to 100 leads per month',
          'Basic scoring',
          'Email support'
        ]
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 2999, // $29.99
        currency: 'usd',
        interval: 'month',
        credits: 10000,
        features: [
          'Full OSINT enrichment',
          'Up to 10,000 leads per month',
          'Advanced scoring',
          'Priority support',
          'API access',
          'Custom integrations'
        ]
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 9999, // $99.99
        currency: 'usd',
        interval: 'month',
        credits: 50000,
        features: [
          'Everything in Premium',
          'Up to 50,000 leads per month',
          'Dedicated support',
          'Custom deployment',
          'Advanced analytics',
          'White-label options'
        ]
      }
    ],
    addons: [
      {
        id: 'extra-credits',
        name: 'Extra Credits',
        price: 1, // $0.01 per credit
        currency: 'usd',
        unit: 'credit',
        description: 'Additional credits for lead processing'
      }
    ]
  });
});

module.exports = router;
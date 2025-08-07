const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../models/database');
const logger = require('../utils/logger');

const router = express.Router();

// Stripe webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful payment intent
async function handlePaymentIntentSucceeded(paymentIntent) {
  logger.info(`Payment intent succeeded: ${paymentIntent.id}`);

  const userId = paymentIntent.metadata.userId;
  const jobId = paymentIntent.metadata.jobId;

  if (userId) {
    // Update job payment status
    if (jobId) {
      await db.run(
        'UPDATE jobs SET amount_paid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [paymentIntent.amount, jobId, userId]
      );
    }

    // Add credits to user account
    const credits = Math.floor(paymentIntent.amount / 100); // 1 credit per cent
    await db.run(
      'UPDATE users SET credits_remaining = credits_remaining + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [credits, userId]
    );

    logger.info(`Added ${credits} credits to user ${userId}`);
  }
}

// Handle failed payment intent
async function handlePaymentIntentFailed(paymentIntent) {
  logger.warn(`Payment intent failed: ${paymentIntent.id}`);

  const userId = paymentIntent.metadata.userId;
  const jobId = paymentIntent.metadata.jobId;

  if (userId && jobId) {
    // Update job status to indicate payment failure
    await db.run(
      'UPDATE jobs SET error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      ['Payment failed', jobId, userId]
    );
  }
}

// Handle subscription creation
async function handleSubscriptionCreated(subscription) {
  logger.info(`Subscription created: ${subscription.id}`);

  const customerId = subscription.customer;
  
  // Find user by customer ID (would need to store this during signup)
  const user = await db.get(
    'SELECT id FROM users WHERE stripe_customer_id = ?',
    [customerId]
  );

  if (user) {
    // Determine subscription type based on price
    let subscriptionType = 'free';
    let creditsToAdd = 0;

    if (subscription.items.data.length > 0) {
      const priceId = subscription.items.data[0].price.id;
      // Map price IDs to subscription types
      // This would be configured based on your Stripe price IDs
      if (priceId === 'price_premium') {
        subscriptionType = 'premium';
        creditsToAdd = 10000;
      } else if (priceId === 'price_enterprise') {
        subscriptionType = 'enterprise';
        creditsToAdd = 50000;
      }
    }

    // Update user subscription
    await db.run(
      `UPDATE users SET 
       subscription_type = ?, 
       subscription_expires_at = datetime(?, 'unixepoch'),
       credits_remaining = credits_remaining + ?,
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [subscriptionType, subscription.current_period_end, creditsToAdd, user.id]
    );

    logger.info(`Updated user ${user.id} subscription to ${subscriptionType}`);
  }
}

// Handle subscription update
async function handleSubscriptionUpdated(subscription) {
  logger.info(`Subscription updated: ${subscription.id}`);

  const customerId = subscription.customer;
  
  const user = await db.get(
    'SELECT id FROM users WHERE stripe_customer_id = ?',
    [customerId]
  );

  if (user) {
    // Update subscription expiration
    await db.run(
      `UPDATE users SET 
       subscription_expires_at = datetime(?, 'unixepoch'),
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [subscription.current_period_end, user.id]
    );
  }
}

// Handle subscription deletion
async function handleSubscriptionDeleted(subscription) {
  logger.info(`Subscription deleted: ${subscription.id}`);

  const customerId = subscription.customer;
  
  const user = await db.get(
    'SELECT id FROM users WHERE stripe_customer_id = ?',
    [customerId]
  );

  if (user) {
    // Downgrade to free plan
    await db.run(
      `UPDATE users SET 
       subscription_type = 'free',
       subscription_expires_at = NULL,
       credits_remaining = 100,
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [user.id]
    );

    logger.info(`Downgraded user ${user.id} to free plan`);
  }
}

// Handle successful invoice payment
async function handleInvoicePaymentSucceeded(invoice) {
  logger.info(`Invoice payment succeeded: ${invoice.id}`);

  const customerId = invoice.customer;
  
  const user = await db.get(
    'SELECT id FROM users WHERE stripe_customer_id = ?',
    [customerId]
  );

  if (user) {
    // Reset credits for the new billing period
    let creditsToAdd = 0;
    const subscriptionType = user.subscription_type;

    if (subscriptionType === 'premium') {
      creditsToAdd = 10000;
    } else if (subscriptionType === 'enterprise') {
      creditsToAdd = 50000;
    }

    if (creditsToAdd > 0) {
      await db.run(
        'UPDATE users SET credits_remaining = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [creditsToAdd, user.id]
      );
    }
  }
}

// Handle failed invoice payment
async function handleInvoicePaymentFailed(invoice) {
  logger.warn(`Invoice payment failed: ${invoice.id}`);

  const customerId = invoice.customer;
  
  const user = await db.get(
    'SELECT id FROM users WHERE stripe_customer_id = ?',
    [customerId]
  );

  if (user) {
    // Could implement grace period or immediate downgrade logic here
    logger.warn(`Payment failed for user ${user.id}`);
  }
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;
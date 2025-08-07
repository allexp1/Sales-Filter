const logger = require('../utils/logger');

exports.up = async function(db) {
  logger.info('Running migration: 001_initial_schema');
  
  // Create users table
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      company TEXT,
      industry TEXT,
      subscription_type TEXT DEFAULT 'free',
      subscription_expires_at DATETIME,
      credits_remaining INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create jobs table
  await db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      total_leads INTEGER DEFAULT 0,
      processed_leads INTEGER DEFAULT 0,
      enriched_leads INTEGER DEFAULT 0,
      high_score_leads INTEGER DEFAULT 0,
      error_message TEXT,
      results_filename TEXT,
      payment_intent_id TEXT,
      amount_paid INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  
  // Create job logs table
  await db.run(`
    CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
    )
  `);
  
  // Create lead results table
  await db.run(`
    CREATE TABLE IF NOT EXISTS lead_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      domain TEXT,
      company_name TEXT,
      industry TEXT,
      score INTEGER DEFAULT 0,
      score_breakdown TEXT, -- JSON string
      osint_data TEXT, -- JSON string with all enrichment data
      risk_flags TEXT, -- JSON array of risk flags
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
    )
  `);
  
  // Create API usage tracking table
  await db.run(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      service_name TEXT NOT NULL,
      endpoint TEXT,
      requests_count INTEGER DEFAULT 1,
      date DATE DEFAULT (DATE('now')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    )
  `);
  
  // Create indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs (user_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs (job_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_lead_results_job_id ON lead_results (job_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_lead_results_score ON lead_results (score)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_api_usage_user_date ON api_usage (user_id, date)');
  
  logger.info('Migration 001_initial_schema completed');
};

exports.down = async function(db) {
  logger.info('Rolling back migration: 001_initial_schema');
  
  // Drop indexes
  await db.run('DROP INDEX IF EXISTS idx_api_usage_user_date');
  await db.run('DROP INDEX IF EXISTS idx_lead_results_score');
  await db.run('DROP INDEX IF EXISTS idx_lead_results_job_id');
  await db.run('DROP INDEX IF EXISTS idx_job_logs_job_id');
  await db.run('DROP INDEX IF EXISTS idx_jobs_status');
  await db.run('DROP INDEX IF EXISTS idx_jobs_user_id');
  await db.run('DROP INDEX IF EXISTS idx_users_email');
  
  // Drop tables
  await db.run('DROP TABLE IF EXISTS api_usage');
  await db.run('DROP TABLE IF EXISTS lead_results');
  await db.run('DROP TABLE IF EXISTS job_logs');
  await db.run('DROP TABLE IF EXISTS jobs');
  await db.run('DROP TABLE IF EXISTS users');
  
  logger.info('Rollback 001_initial_schema completed');
};
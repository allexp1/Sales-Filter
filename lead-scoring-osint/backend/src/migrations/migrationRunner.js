const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class MigrationRunner {
  constructor(database) {
    this.db = database;
    this.migrationsDir = __dirname;
  }

  async initialize() {
    // Create migrations tracking table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getMigrationFiles() {
    const files = await fs.readdir(this.migrationsDir);
    return files
      .filter(file => file.endsWith('.js') && file !== 'migrationRunner.js')
      .sort(); // Ensure migrations run in order
  }

  async getAppliedMigrations() {
    const rows = await this.db.all('SELECT filename FROM migrations ORDER BY filename');
    return rows.map(row => row.filename);
  }

  async runMigrations() {
    try {
      await this.initialize();
      
      const migrationFiles = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();
      const pendingMigrations = migrationFiles.filter(file => !appliedMigrations.includes(file));

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(`Found ${pendingMigrations.length} pending migrations`);

      for (const filename of pendingMigrations) {
        await this.runMigration(filename);
      }

      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration runner failed:', error);
      throw error;
    }
  }

  async runMigration(filename) {
    const filepath = path.join(this.migrationsDir, filename);
    logger.info(`Running migration: ${filename}`);

    try {
      // Begin transaction
      await this.db.run('BEGIN TRANSACTION');

      // Load and run migration
      const migration = require(filepath);
      
      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${filename} does not export an 'up' function`);
      }

      await migration.up(this.db);

      // Record migration as applied
      await this.db.run('INSERT INTO migrations (filename) VALUES (?)', [filename]);

      // Commit transaction
      await this.db.run('COMMIT');
      
      logger.info(`Migration ${filename} completed successfully`);
    } catch (error) {
      // Rollback on error
      await this.db.run('ROLLBACK');
      logger.error(`Migration ${filename} failed:`, error);
      throw error;
    }
  }

  async rollback(steps = 1) {
    try {
      await this.initialize();
      
      const appliedMigrations = await this.getAppliedMigrations();
      
      if (appliedMigrations.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      const migrationsToRollback = appliedMigrations.slice(-steps).reverse();
      
      logger.info(`Rolling back ${migrationsToRollback.length} migrations`);

      for (const filename of migrationsToRollback) {
        await this.rollbackMigration(filename);
      }

      logger.info('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }

  async rollbackMigration(filename) {
    const filepath = path.join(this.migrationsDir, filename);
    logger.info(`Rolling back migration: ${filename}`);

    try {
      // Begin transaction
      await this.db.run('BEGIN TRANSACTION');

      // Load and run migration rollback
      const migration = require(filepath);
      
      if (typeof migration.down !== 'function') {
        throw new Error(`Migration ${filename} does not export a 'down' function`);
      }

      await migration.down(this.db);

      // Remove migration record
      await this.db.run('DELETE FROM migrations WHERE filename = ?', [filename]);

      // Commit transaction
      await this.db.run('COMMIT');
      
      logger.info(`Rollback of ${filename} completed successfully`);
    } catch (error) {
      // Rollback on error
      await this.db.run('ROLLBACK');
      logger.error(`Rollback of ${filename} failed:`, error);
      throw error;
    }
  }

  async reset() {
    try {
      logger.info('Resetting database...');
      
      // Get all applied migrations in reverse order
      const appliedMigrations = await this.getAppliedMigrations();
      
      if (appliedMigrations.length > 0) {
        await this.rollback(appliedMigrations.length);
      }

      // Run all migrations fresh
      await this.runMigrations();
      
      logger.info('Database reset completed');
    } catch (error) {
      logger.error('Database reset failed:', error);
      throw error;
    }
  }
}

module.exports = MigrationRunner;
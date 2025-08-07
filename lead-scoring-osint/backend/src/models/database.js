const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const MigrationRunner = require('../migrations/migrationRunner');

class Database {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/database.sqlite');
  }

  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Connect to database
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Error connecting to database:', err);
          throw err;
        }
      });

      // Enable foreign keys
      await this.run('PRAGMA foreign_keys = ON');
      
      // Run migrations
      const migrationRunner = new MigrationRunner(this);
      await migrationRunner.runMigrations();
      
      logger.info('Database initialized successfully');
      return this.db;
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }


  // Promisify database operations
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

const database = new Database();
module.exports = database;
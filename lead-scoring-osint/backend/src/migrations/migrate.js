#!/usr/bin/env node

const path = require('path');
const database = require('../models/database');
const MigrationRunner = require('./migrationRunner');
const logger = require('../utils/logger');

// Parse command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  try {
    // Initialize database connection
    await database.initialize();
    
    // Create migration runner
    const runner = new MigrationRunner(database);

    switch (command) {
      case 'up':
      case 'migrate':
        await runner.runMigrations();
        break;
        
      case 'down':
      case 'rollback':
        const steps = args[0] ? parseInt(args[0]) : 1;
        await runner.rollback(steps);
        break;
        
      case 'reset':
        await runner.reset();
        break;
        
      case 'status':
        await showStatus(runner);
        break;
        
      default:
        showHelp();
        process.exit(1);
    }

    // Close database connection
    await database.close();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    await database.close();
    process.exit(1);
  }
}

async function showStatus(runner) {
  const migrationFiles = await runner.getMigrationFiles();
  const appliedMigrations = await runner.getAppliedMigrations();
  
  console.log('\nMigration Status:');
  console.log('=================\n');
  
  for (const file of migrationFiles) {
    const status = appliedMigrations.includes(file) ? '✓ Applied' : '○ Pending';
    console.log(`${status} - ${file}`);
  }
  
  console.log(`\nTotal: ${migrationFiles.length} migrations`);
  console.log(`Applied: ${appliedMigrations.length}`);
  console.log(`Pending: ${migrationFiles.length - appliedMigrations.length}\n`);
}

function showHelp() {
  console.log(`
Lead Scoring OSINT - Database Migration Tool

Usage: node migrate.js <command> [options]

Commands:
  up, migrate          Run all pending migrations
  down, rollback [n]   Rollback last n migrations (default: 1)
  reset               Rollback all migrations and run them fresh
  status              Show migration status

Examples:
  node migrate.js up              # Run all pending migrations
  node migrate.js rollback 2      # Rollback last 2 migrations
  node migrate.js reset           # Reset database
  node migrate.js status          # Show migration status
`);
}

// Run main function
main();
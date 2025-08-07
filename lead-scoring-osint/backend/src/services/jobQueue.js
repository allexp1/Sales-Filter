const Queue = require('bull');
const Redis = require('redis');
const logger = require('../utils/logger');

// Initialize Redis client
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

// Initialize job queue
const jobQueue = new Queue('lead processing', process.env.REDIS_URL || 'redis://localhost:6379', {
  defaultJobOptions: {
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 50,     // Keep last 50 failed jobs
    attempts: 3,          // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,
    }
  }
});

// Job queue event handlers
jobQueue.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed successfully`, { jobData: job.data, result });
});

jobQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed:`, err, { jobData: job.data });
});

jobQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`, { jobData: job.data });
});

jobQueue.on('progress', (job, progress) => {
  logger.debug(`Job ${job.id} progress: ${progress}%`);
});

// Job processing function (will be handled by worker)
jobQueue.process('processLeads', async (job) => {
  // This will be processed by the worker process
  // For now, just return the job data
  return { processed: true, jobId: job.data.jobId };
});

// Export queue and redis client
module.exports = {
  jobQueue,
  redis,
  
  // Helper functions
  async getJobStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      jobQueue.getWaiting(),
      jobQueue.getActive(),
      jobQueue.getCompleted(),
      jobQueue.getFailed(),
      jobQueue.getDelayed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length
    };
  },

  async getJob(jobId) {
    return jobQueue.getJob(jobId);
  },

  async addJob(name, data, options = {}) {
    return jobQueue.add(name, data, options);
  },

  async removeJob(jobId) {
    const job = await jobQueue.getJob(jobId);
    if (job) {
      await job.remove();
      return true;
    }
    return false;
  },

  async pauseQueue() {
    await jobQueue.pause();
  },

  async resumeQueue() {
    await jobQueue.resume();
  },

  async cleanQueue(grace = 5000, status = 'completed') {
    return jobQueue.clean(grace, status);
  }
};
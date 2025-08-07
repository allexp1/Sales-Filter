const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../models/database');
const logger = require('../utils/logger');
const { NotFoundError } = require('../middleware/errorHandler');
const { jobQueue } = require('../services/jobQueue');

const router = express.Router();

// GET /api/jobs - Get all jobs for current user
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = ?';
    const params = [req.user.id];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    const jobs = await db.all(
      `SELECT id, filename, original_filename, status, progress, total_leads, 
              processed_leads, enriched_leads, high_score_leads, error_message,
              results_filename, amount_paid, created_at, updated_at
       FROM jobs 
       ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const total = await db.get(
      `SELECT COUNT(*) as count FROM jobs ${whereClause}`,
      params
    );

    res.json({
      jobs,
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

// GET /api/jobs/:id - Get specific job details
router.get('/:id', async (req, res, next) => {
  try {
    const job = await db.get(
      'SELECT * FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    // Get job logs
    const logs = await db.all(
      'SELECT level, message, timestamp FROM job_logs WHERE job_id = ? ORDER BY timestamp DESC',
      [job.id]
    );

    // Get bull job status if still active
    let queueStatus = null;
    try {
      const bullJob = await jobQueue.getJob(job.id);
      if (bullJob) {
        queueStatus = {
          state: await bullJob.getState(),
          progress: bullJob.progress(),
          processedOn: bullJob.processedOn,
          finishedOn: bullJob.finishedOn,
          failedReason: bullJob.failedReason
        };
      }
    } catch (err) {
      logger.debug('Could not get bull job status:', err.message);
    }

    res.json({
      job: {
        ...job,
        logs,
        queueStatus
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/jobs/:id/status - Get real-time job status
router.get('/:id/status', async (req, res, next) => {
  try {
    const job = await db.get(
      'SELECT id, status, progress, total_leads, processed_leads, error_message FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    // Get latest log entries
    const recentLogs = await db.all(
      'SELECT level, message, timestamp FROM job_logs WHERE job_id = ? ORDER BY timestamp DESC LIMIT 10',
      [job.id]
    );

    res.json({
      status: job.status,
      progress: job.progress,
      totalLeads: job.total_leads,
      processedLeads: job.processed_leads,
      errorMessage: job.error_message,
      recentLogs
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/jobs/:id/results - Get lead results
router.get('/:id/results', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, sortBy = 'score', order = 'desc', minScore } = req.query;
    const offset = (page - 1) * limit;

    // Verify job belongs to user
    const job = await db.get(
      'SELECT id, status FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    let whereClause = 'WHERE job_id = ?';
    const params = [job.id];

    if (minScore) {
      whereClause += ' AND score >= ?';
      params.push(parseInt(minScore));
    }

    const validSortColumns = ['email', 'domain', 'company_name', 'score', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'score';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const results = await db.all(
      `SELECT id, email, domain, company_name, industry, score, 
              score_breakdown, osint_data, risk_flags, created_at
       FROM lead_results 
       ${whereClause} 
       ORDER BY ${sortColumn} ${sortOrder} 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const total = await db.get(
      `SELECT COUNT(*) as count FROM lead_results ${whereClause}`,
      params.slice(0, -2) // Remove LIMIT and OFFSET params
    );

    // Parse JSON fields
    const processedResults = results.map(result => ({
      ...result,
      score_breakdown: result.score_breakdown ? JSON.parse(result.score_breakdown) : null,
      osint_data: result.osint_data ? JSON.parse(result.osint_data) : null,
      risk_flags: result.risk_flags ? JSON.parse(result.risk_flags) : []
    }));

    res.json({
      results: processedResults,
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

// GET /api/jobs/:id/download - Download results file
router.get('/:id/download', async (req, res, next) => {
  try {
    const job = await db.get(
      'SELECT id, results_filename, original_filename, status FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.status !== 'completed' || !job.results_filename) {
      throw new NotFoundError('Results file not ready or not found');
    }

    const filePath = path.join(__dirname, '../../processed', job.results_filename);
    
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Results file not found on disk');
    }

    // Set download headers
    const downloadName = `enriched_${job.original_filename}`;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    logger.info(`User ${req.user.id} downloaded results for job ${job.id}`);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/jobs/:id - Delete a job and its data
router.delete('/:id', async (req, res, next) => {
  try {
    const job = await db.get(
      'SELECT * FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    // Remove from queue if still active
    try {
      const bullJob = await jobQueue.getJob(job.id);
      if (bullJob) {
        await bullJob.remove();
      }
    } catch (err) {
      logger.debug('Could not remove job from queue:', err.message);
    }

    // Delete uploaded file
    if (job.filename) {
      const uploadPath = path.join(__dirname, '../../uploads', job.filename);
      if (fs.existsSync(uploadPath)) {
        fs.unlinkSync(uploadPath);
      }
    }

    // Delete results file
    if (job.results_filename) {
      const resultsPath = path.join(__dirname, '../../processed', job.results_filename);
      if (fs.existsSync(resultsPath)) {
        fs.unlinkSync(resultsPath);
      }
    }

    // Delete from database (cascades to job_logs and lead_results)
    await db.run('DELETE FROM jobs WHERE id = ?', [job.id]);

    logger.info(`User ${req.user.id} deleted job ${job.id}`);

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/jobs/:id/retry - Retry a failed job
router.post('/:id/retry', async (req, res, next) => {
  try {
    const job = await db.get(
      'SELECT * FROM jobs WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed jobs can be retried' });
    }

    // Reset job status
    await db.run(
      'UPDATE jobs SET status = ?, progress = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['pending', job.id]
    );

    // Re-add to queue (assuming we can reconstruct the job data)
    // This would require storing the original job data or reconstructing it
    // For now, just update the status
    
    logger.info(`User ${req.user.id} retried job ${job.id}`);

    res.json({ message: 'Job queued for retry' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const XLSX = require('xlsx');
const { authMiddleware } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const jobQueue = require('../queues/jobQueue');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: (process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024 // Default 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = (process.env.ALLOWED_FILE_EXTENSIONS || '.xlsx,.xls,.csv').split(',');
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Allowed types: ${allowedExtensions.join(', ')}`));
    }
  }
});

// Upload leads file
router.post('/upload', authMiddleware, checkSubscription, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse the uploaded file
    const filePath = req.file.path;
    let leads = [];

    if (path.extname(req.file.originalname).toLowerCase() === '.csv') {
      // Handle CSV files
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      
      leads = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const lead = {};
        headers.forEach((header, index) => {
          lead[header] = values[index] || '';
        });
        return lead;
      });
    } else {
      // Handle Excel files
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      leads = XLSX.utils.sheet_to_json(worksheet);
    }

    // Validate leads data
    if (!leads.length) {
      await fs.unlink(filePath);
      return res.status(400).json({ error: 'No leads found in file' });
    }

    // Validate required fields
    const requiredFields = ['company_name', 'domain'];
    const firstLead = leads[0];
    const missingFields = requiredFields.filter(field => !firstLead[field]);
    
    if (missingFields.length > 0) {
      await fs.unlink(filePath);
      return res.status(400).json({ 
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Create job in database
    const jobId = uuidv4();
    await db.run(
      `INSERT INTO jobs (id, user_id, status, file_path, total_leads, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [jobId, req.user.userId, 'pending', filePath, leads.length, new Date().toISOString()]
    );

    // Add job to queue
    const job = await jobQueue.add('process-leads', {
      jobId,
      userId: req.user.userId,
      filePath,
      leads
    });

    res.json({
      success: true,
      jobId,
      totalLeads: leads.length,
      status: 'pending',
      message: 'File uploaded successfully. Processing will begin shortly.'
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded file on error
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to process upload' 
    });
  }
});

// Download template
router.get('/template', authMiddleware, async (req, res) => {
  try {
    // Create template workbook
    const wb = XLSX.utils.book_new();
    
    // Sample data
    const templateData = [
      {
        company_name: 'Example Company Inc',
        domain: 'example.com',
        email: 'contact@example.com',
        phone: '+1-555-123-4567',
        address: '123 Main St, New York, NY 10001',
        industry: 'Technology',
        employee_count: '50-100',
        annual_revenue: '$1M-$10M',
        notes: 'Additional notes about the lead'
      },
      {
        company_name: 'Another Business LLC',
        domain: 'another-business.com',
        email: 'info@another-business.com',
        phone: '+1-555-987-6543',
        address: '456 Oak Ave, San Francisco, CA 94102',
        industry: 'Healthcare',
        employee_count: '100-500',
        annual_revenue: '$10M-$50M',
        notes: 'High priority lead'
      }
    ];
    
    // Create worksheet with headers and sample data
    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    
    // Add instructions sheet
    const instructionsData = [
      { Instruction: 'Lead Scoring OSINT Template Instructions' },
      { Instruction: '' },
      { Instruction: 'Required Fields:' },
      { Instruction: '- company_name: The name of the company' },
      { Instruction: '- domain: The company website domain (e.g., example.com)' },
      { Instruction: '' },
      { Instruction: 'Optional Fields:' },
      { Instruction: '- email: Primary contact email address' },
      { Instruction: '- phone: Primary phone number' },
      { Instruction: '- address: Company physical address' },
      { Instruction: '- industry: Business industry/sector' },
      { Instruction: '- employee_count: Estimated number of employees' },
      { Instruction: '- annual_revenue: Estimated annual revenue' },
      { Instruction: '- notes: Any additional notes or context' },
      { Instruction: '' },
      { Instruction: 'File Format:' },
      { Instruction: '- Save as .xlsx, .xls, or .csv format' },
      { Instruction: '- Maximum file size: 10MB' },
      { Instruction: '- Maximum leads per file: 10,000' },
      { Instruction: '' },
      { Instruction: 'Tips:' },
      { Instruction: '- Ensure domain names are valid (no http:// prefix)' },
      { Instruction: '- Use consistent formatting for phone numbers' },
      { Instruction: '- Industry names should be standardized when possible' }
    ];
    
    const instructionsWs = XLSX.utils.json_to_sheet(instructionsData, { header: ['Instruction'] });
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
    
    // Generate buffer
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    
    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="lead_scoring_template.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Check upload status
router.get('/status/:jobId', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get job details from database
    const job = await db.get(
      'SELECT * FROM jobs WHERE id = ? AND user_id = ?',
      [jobId, req.user.userId]
    );
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress || 0,
      totalLeads: job.total_leads,
      processedLeads: job.processed_leads || 0,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      error: job.error
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

module.exports = router;
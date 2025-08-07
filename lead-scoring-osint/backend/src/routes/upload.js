const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/database');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { checkCredits } = require('../middleware/auth');
const jobQueue = require('../services/jobQueue');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || '.xlsx,.csv').split(',');
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${fileExt} not allowed. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

// Parse uploaded file and extract leads
const parseLeadsFile = async (filePath, originalFilename) => {
  const leads = [];
  const fileExt = path.extname(originalFilename).toLowerCase();

  try {
    if (fileExt === '.xlsx') {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      for (const row of data) {
        const lead = extractLeadFromRow(row);
        if (lead) leads.push(lead);
      }
    } else if (fileExt === '.csv') {
      return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            const lead = extractLeadFromRow(row);
            if (lead) leads.push(lead);
          })
          .on('end', () => resolve(leads))
          .on('error', reject);
      });
    }

    return leads;
  } catch (error) {
    logger.error('Error parsing leads file:', error);
    throw new Error('Failed to parse leads file');
  }
};

// Extract lead information from row data
const extractLeadFromRow = (row) => {
  // Look for common column names (case-insensitive)
  const getColumnValue = (possibleNames) => {
    for (const name of possibleNames) {
      const key = Object.keys(row).find(k => k.toLowerCase().includes(name.toLowerCase()));
      if (key && row[key]) return row[key].toString().trim();
    }
    return null;
  };

  const email = getColumnValue(['email', 'e-mail', 'mail']);
  const name = getColumnValue(['name', 'fullname', 'full_name', 'company_name', 'company']);
  const company = getColumnValue(['company', 'organization', 'org']);
  const phone = getColumnValue(['phone', 'tel', 'telephone', 'mobile']);
  const website = getColumnValue(['website', 'url', 'domain']);

  if (!email || !email.includes('@')) {
    return null; // Skip rows without valid email
  }

  return {
    email: email.toLowerCase(),
    name: name || '',
    company: company || '',
    phone: phone || '',
    website: website || '',
    domain: email.split('@')[1].toLowerCase()
  };
};

// POST /api/upload
router.post('/', checkCredits(1), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const { industry } = req.body;
    
    // Parse the uploaded file
    const leads = await parseLeadsFile(req.file.path, req.file.originalname);
    
    if (leads.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      throw new ValidationError('No valid leads found in the uploaded file');
    }

    // Check if user has enough credits
    const maxLeads = req.user.subscriptionType === 'premium' ? 
      parseInt(process.env.MAX_LEADS_PREMIUM) || 10000 : 
      parseInt(process.env.MAX_LEADS_FREE) || 100;

    if (leads.length > maxLeads) {
      fs.unlinkSync(req.file.path);
      throw new ValidationError(`File contains ${leads.length} leads, but your plan allows maximum ${maxLeads} leads`);
    }

    // Create job record
    const jobResult = await db.run(
      `INSERT INTO jobs (user_id, filename, original_filename, total_leads, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, req.file.filename, req.file.originalname, leads.length, 'pending']
    );

    // Add job to queue
    await jobQueue.add('processLeads', {
      jobId: jobResult.id,
      userId: req.user.id,
      filePath: req.file.path,
      leads,
      industry: industry || 'unknown'
    });

    logger.info(`Job ${jobResult.id} created for user ${req.user.id} with ${leads.length} leads`);

    res.status(201).json({
      message: 'File uploaded successfully',
      job: {
        id: jobResult.id,
        totalLeads: leads.length,
        status: 'pending',
        estimatedTime: Math.ceil(leads.length * 2) // Rough estimate: 2 seconds per lead
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
});

// GET /api/upload/templates
router.get('/templates', (req, res) => {
  res.json({
    templates: [
      {
        name: 'Basic Template',
        description: 'Simple template with email and name columns',
        columns: ['email', 'name'],
        example: {
          email: 'john.doe@example.com',
          name: 'John Doe'
        }
      },
      {
        name: 'Company Template',
        description: 'Template with company information',
        columns: ['email', 'name', 'company', 'website'],
        example: {
          email: 'john.doe@example.com',
          name: 'John Doe',
          company: 'Example Corp',
          website: 'example.com'
        }
      },
      {
        name: 'Full Template',
        description: 'Complete template with all supported fields',
        columns: ['email', 'name', 'company', 'phone', 'website'],
        example: {
          email: 'john.doe@example.com',
          name: 'John Doe',
          company: 'Example Corp',
          phone: '+1-555-0123',
          website: 'example.com'
        }
      }
    ]
  });
});

// GET /api/upload/validate
router.post('/validate', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const leads = await parseLeadsFile(req.file.path, req.file.originalname);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    const validation = {
      totalRows: leads.length,
      validLeads: leads.length,
      invalidRows: 0,
      columns: leads.length > 0 ? Object.keys(leads[0]) : [],
      preview: leads.slice(0, 5)
    };

    res.json({
      message: 'File validated successfully',
      validation
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
});

module.exports = router;
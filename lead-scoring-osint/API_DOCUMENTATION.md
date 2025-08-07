# Lead Scoring OSINT API Documentation

## Overview

The Lead Scoring OSINT API provides endpoints for lead enrichment, scoring, and management. The API uses JWT authentication and supports real-time updates via WebSocket connections.

## Base URL

```
Development: http://localhost:3001/api
Production: https://api.leadscorer.com/api
```

## Authentication

All API requests (except auth endpoints) require a JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## WebSocket Connection

For real-time updates, connect to the WebSocket server:

```javascript
const socket = io('ws://localhost:3001', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

## API Endpoints

### Authentication

#### POST /auth/signup
Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "company_name": "Acme Inc"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "company_name": "Acme Inc"
  },
  "subscription": {
    "plan_id": "starter",
    "status": "trial"
  }
}
```

#### POST /auth/login
Authenticate a user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "company_name": "Acme Inc"
  },
  "subscription": {
    "plan_id": "professional",
    "status": "active"
  }
}
```

#### GET /auth/me
Get current user information.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "company_name": "Acme Inc"
  },
  "subscription": {
    "plan_id": "professional",
    "status": "active",
    "credits_limit": 5000,
    "credits_used": 1234
  }
}
```

#### POST /auth/logout
Logout the current user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### File Upload

#### POST /upload
Upload a leads file for processing.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data
```

**Request Body:**
- `file`: Excel or CSV file containing leads data

**Response:**
```json
{
  "success": true,
  "jobId": "job_uuid",
  "totalLeads": 150,
  "status": "pending",
  "message": "File uploaded successfully. Processing will begin shortly."
}
```

#### GET /upload/template
Download a template file for lead uploads.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
- Excel file download with template structure

#### GET /upload/status/:jobId
Check the status of an upload job.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "jobId": "job_uuid",
  "status": "processing",
  "progress": 45,
  "totalLeads": 150,
  "processedLeads": 68,
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": null,
  "error": null
}
```

### Jobs Management

#### GET /jobs
Get all jobs for the current user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `status` (optional): Filter by status (pending, processing, completed, failed)

**Response:**
```json
{
  "jobs": [
    {
      "id": "job_uuid",
      "status": "completed",
      "totalLeads": 150,
      "processedLeads": 150,
      "createdAt": "2024-01-15T10:30:00Z",
      "completedAt": "2024-01-15T10:45:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

#### GET /jobs/:jobId
Get details of a specific job.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "id": "job_uuid",
  "status": "completed",
  "totalLeads": 150,
  "processedLeads": 150,
  "results": {
    "enriched": 145,
    "failed": 5,
    "averageScore": 7.8
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:45:00Z"
}
```

#### GET /jobs/:jobId/download
Download the enriched results file.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
- Excel file download with enriched lead data

#### DELETE /jobs/:jobId
Delete a job and its associated data.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Job deleted successfully"
}
```

#### GET /jobs/:jobId/logs
Get processing logs for a job.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `level` (optional): Filter by log level (info, warning, error)
- `limit` (optional): Number of logs to return (default: 100)

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2024-01-15T10:31:00Z",
      "level": "info",
      "message": "Processing lead: example.com",
      "metadata": {
        "leadIndex": 1,
        "domain": "example.com"
      }
    }
  ]
}
```

### Subscriptions & Billing

#### GET /subscriptions/current
Get current subscription details.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "subscription": {
    "plan_id": "professional",
    "plan_name": "Professional",
    "status": "active",
    "price": 149,
    "credits_limit": 5000,
    "features": [
      "all_osint_sources",
      "api_access",
      "custom_scoring"
    ],
    "current_period_start": "2024-01-01T00:00:00Z",
    "current_period_end": "2024-02-01T00:00:00Z"
  }
}
```

#### GET /subscriptions/usage
Get current usage statistics.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "credits_used": 1234,
  "credits_limit": 5000,
  "period_start": "2024-01-01T00:00:00Z",
  "period_end": "2024-02-01T00:00:00Z",
  "usage_by_day": [
    {
      "date": "2024-01-15",
      "credits": 150
    }
  ]
}
```

#### POST /subscriptions/change-plan
Change subscription plan.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "plan_id": "enterprise"
}
```

**Response:**
```json
{
  "success": true,
  "payment_required": true,
  "message": "Plan change initiated. Payment required."
}
```

#### GET /subscriptions/plans/:planId
Get details of a specific plan.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "id": "professional",
  "name": "Professional",
  "price": 149,
  "credits": 5000,
  "features": [
    "All OSINT data sources",
    "API access",
    "Custom scoring models"
  ]
}
```

### Payments

#### POST /payments/create-subscription
Create a subscription payment.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "plan_id": "professional"
}
```

**Response:**
```json
{
  "client_secret": "stripe_client_secret",
  "subscription_id": "sub_uuid"
}
```

#### POST /payments/update-method
Update payment method.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "payment_method_id": "pm_stripe_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment method updated successfully"
}
```

## WebSocket Events

### Client to Server Events

#### subscribe-job
Subscribe to real-time updates for a specific job.

```javascript
socket.emit('subscribe-job', { jobId: 'job_uuid' });
```

#### unsubscribe-job
Unsubscribe from job updates.

```javascript
socket.emit('unsubscribe-job', { jobId: 'job_uuid' });
```

### Server to Client Events

#### job:update
Receive job status updates.

```javascript
socket.on('job:update', (data) => {
  console.log('Job update:', data);
  // data: { jobId, status, progress, processedLeads, totalLeads }
});
```

#### job:progress
Receive job progress updates.

```javascript
socket.on('job:progress', (data) => {
  console.log('Job progress:', data);
  // data: { jobId, progress, processedLeads, totalLeads, currentLead }
});
```

#### job:log
Receive job log entries.

```javascript
socket.on('job:log', (data) => {
  console.log('Job log:', data);
  // data: { jobId, level, message, timestamp, metadata }
});
```

#### job:complete
Receive job completion notification.

```javascript
socket.on('job:complete', (data) => {
  console.log('Job completed:', data);
  // data: { jobId, results, downloadUrl }
});
```

#### job:error
Receive job error notification.

```javascript
socket.on('job:error', (data) => {
  console.log('Job error:', data);
  // data: { jobId, error, message }
});
```

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Rate Limiting

API requests are rate limited to prevent abuse:
- Default: 100 requests per 15 minutes per IP
- Authenticated users: 1000 requests per 15 minutes
- WebSocket connections: 10 per user

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248900
```

## File Formats

### Lead Upload Format

Excel/CSV files should contain the following columns:

**Required:**
- `company_name` - Company name
- `domain` - Company website domain

**Optional:**
- `email` - Contact email
- `phone` - Phone number
- `address` - Physical address
- `industry` - Industry/sector
- `employee_count` - Number of employees
- `annual_revenue` - Annual revenue
- `notes` - Additional notes

### Enriched Results Format

Downloaded results include all original fields plus:

- `lead_score` - Overall lead quality score (0-10)
- `dns_score` - DNS infrastructure score
- `tech_score` - Technology stack score
- `traffic_score` - Web traffic score
- `business_score` - Business information score
- `email_risk_score` - Email security score
- `github_score` - Developer presence score
- `archive_score` - Web history score
- `security_score` - Security posture score
- `enriched_data` - JSON object with all collected OSINT data

## Best Practices

1. **Authentication**: Store JWT tokens securely and refresh them before expiration
2. **File Uploads**: Validate file format and size before uploading
3. **WebSocket**: Implement reconnection logic for connection drops
4. **Error Handling**: Implement proper error handling for all API calls
5. **Rate Limiting**: Implement backoff strategies when rate limited
6. **Large Files**: For files with >1000 leads, consider splitting into batches

## SDKs and Examples

Example implementations are available in:
- [JavaScript/Node.js](https://github.com/leadscorer/sdk-js)
- [Python](https://github.com/leadscorer/sdk-python)
- [PHP](https://github.com/leadscorer/sdk-php)

## Support

For API support, contact:
- Email: api-support@leadscorer.com
- Documentation: https://docs.leadscorer.com
- Status Page: https://status.leadscorer.com
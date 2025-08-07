# Lead Scoring OSINT - Testing Guide

This guide will help you test the lead scoring OSINT system step by step.

## Prerequisites

1. Docker and Docker Compose installed
2. Node.js 18+ and npm installed (for local testing without Docker)
3. Redis running (for local testing without Docker)

## Quick Start with Docker

### 1. Clone and Setup

```bash
cd lead-scoring-osint
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. Configure Environment Variables

Edit `backend/.env` and add test API keys (or use mock mode):

```env
# For testing, you can use mock mode
USE_MOCK_APIS=true

# Or add real API keys for full testing
SECURITYTRAILS_API_KEY=your_key_here
BUILTWITH_API_KEY=your_key_here
SIMILARWEB_API_KEY=your_key_here
# ... etc
```

### 3. Start Services with Docker

```bash
docker-compose up --build
```

This will start:
- Backend API on http://localhost:3010
- Frontend on http://localhost:3011
- Redis on localhost:6379

### 4. Initialize Database

```bash
docker-compose exec backend npm run migrate
```

## Manual Testing Steps

### 1. Create Test Account

1. Open http://localhost:3001
2. Click "Sign Up"
3. Enter test credentials:
   - Email: test@example.com
   - Password: Test123!
   - Company: Test Company

### 2. Test File Upload

1. Navigate to "Upload Leads"
2. Download the template using "Download Template" button
3. Fill in test data or use the provided test file (see below)
4. Upload the file
5. You should be redirected to the status page

### 3. Monitor Processing

1. On the Status page, watch real-time updates
2. Check the progress bar and log messages
3. Once complete, download the enriched file

### 4. Check Dashboard

1. Navigate to Dashboard
2. Verify statistics update
3. Check the recent jobs list
4. View the lead score distribution chart

## Test Data Files

### Create Test Lead File

Create `test_leads.csv`:

```csv
Domain,Company Name,Contact Email,Industry
google.com,Google Inc,contact@google.com,Technology
microsoft.com,Microsoft Corporation,info@microsoft.com,Software
apple.com,Apple Inc,contact@apple.com,Technology
amazon.com,Amazon,info@amazon.com,E-commerce
facebook.com,Meta,contact@facebook.com,Social Media
```

### Create Test Excel File

Create `test_leads.xlsx` with the same data in Excel format.

## API Testing with cURL

### 1. Get Auth Token

```bash
# Login
curl -X POST http://localhost:3010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Save the token from response
export TOKEN="your_jwt_token_here"
```

### 2. Upload File

```bash
# Upload CSV file
curl -X POST http://localhost:3010/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_leads.csv"
```

### 3. Check Job Status

```bash
# Get all jobs
curl http://localhost:3010/api/jobs \
  -H "Authorization: Bearer $TOKEN"

# Get specific job
curl http://localhost:3010/api/jobs/{jobId} \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Download Results

```bash
# Download enriched file
curl http://localhost:3010/api/jobs/{jobId}/download \
  -H "Authorization: Bearer $TOKEN" \
  -o enriched_leads.xlsx
```

## WebSocket Testing

### Test Real-time Updates

Create `test_websocket.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>WebSocket Test</title>
    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
</head>
<body>
    <h1>WebSocket Test</h1>
    <div id="status">Disconnected</div>
    <div id="messages"></div>
    
    <script>
        const token = 'YOUR_JWT_TOKEN'; // Replace with actual token
        const socket = io('http://localhost:3000', {
            auth: { token }
        });

        socket.on('connect', () => {
            document.getElementById('status').textContent = 'Connected';
            console.log('Connected to WebSocket');
        });

        socket.on('job:progress', (data) => {
            console.log('Progress:', data);
            addMessage(`Progress: ${data.processed}/${data.total}`);
        });

        socket.on('job:log', (data) => {
            console.log('Log:', data);
            addMessage(`Log: ${data.message}`);
        });

        socket.on('job:complete', (data) => {
            console.log('Complete:', data);
            addMessage('Job completed!');
        });

        socket.on('job:error', (data) => {
            console.error('Error:', data);
            addMessage(`Error: ${data.error}`);
        });

        function addMessage(msg) {
            const div = document.createElement('div');
            div.textContent = new Date().toISOString() + ' - ' + msg;
            document.getElementById('messages').appendChild(div);
        }

        // Subscribe to a job
        function subscribeToJob(jobId) {
            socket.emit('subscribe:job', jobId);
        }
    </script>
</body>
</html>
```

## Automated Test Script

Create `test_system.py`:

```python
#!/usr/bin/env python3
import requests
import time
import json
import sys
from datetime import datetime

BASE_URL = "http://localhost:3000/api"
FRONTEND_URL = "http://localhost:3001"

def test_system():
    print("🧪 Starting Lead Scoring OSINT System Test\n")
    
    # Test 1: Check services are running
    print("1️⃣ Checking services...")
    try:
        backend_health = requests.get(f"{BASE_URL}/health")
        print(f"✅ Backend API: {backend_health.status_code}")
        
        frontend_check = requests.get(FRONTEND_URL)
        print(f"✅ Frontend: {frontend_check.status_code}")
    except Exception as e:
        print(f"❌ Services not running: {e}")
        return False
    
    # Test 2: Create account
    print("\n2️⃣ Creating test account...")
    signup_data = {
        "email": f"test_{int(time.time())}@example.com",
        "password": "Test123!",
        "company": "Test Company"
    }
    
    signup_resp = requests.post(f"{BASE_URL}/auth/signup", json=signup_data)
    if signup_resp.status_code == 201:
        print("✅ Account created successfully")
        auth_data = signup_resp.json()
        token = auth_data['token']
    else:
        print(f"❌ Signup failed: {signup_resp.text}")
        return False
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 3: Upload file
    print("\n3️⃣ Testing file upload...")
    
    # Create test CSV content
    csv_content = """Domain,Company Name,Contact Email,Industry
google.com,Google Inc,contact@google.com,Technology
microsoft.com,Microsoft Corporation,info@microsoft.com,Software"""
    
    files = {
        'file': ('test_leads.csv', csv_content, 'text/csv')
    }
    
    upload_resp = requests.post(
        f"{BASE_URL}/upload",
        headers=headers,
        files=files
    )
    
    if upload_resp.status_code == 200:
        print("✅ File uploaded successfully")
        job_data = upload_resp.json()
        job_id = job_data['jobId']
        print(f"   Job ID: {job_id}")
    else:
        print(f"❌ Upload failed: {upload_resp.text}")
        return False
    
    # Test 4: Monitor job progress
    print("\n4️⃣ Monitoring job progress...")
    max_attempts = 30
    attempts = 0
    
    while attempts < max_attempts:
        job_resp = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=headers)
        
        if job_resp.status_code == 200:
            job_status = job_resp.json()
            status = job_status.get('status')
            progress = job_status.get('progress', 0)
            
            print(f"   Status: {status} | Progress: {progress}%")
            
            if status == 'completed':
                print("✅ Job completed successfully!")
                break
            elif status == 'failed':
                print(f"❌ Job failed: {job_status.get('error')}")
                return False
        
        time.sleep(2)
        attempts += 1
    
    if attempts >= max_attempts:
        print("❌ Job timed out")
        return False
    
    # Test 5: Download results
    print("\n5️⃣ Downloading enriched file...")
    download_resp = requests.get(
        f"{BASE_URL}/jobs/{job_id}/download",
        headers=headers
    )
    
    if download_resp.status_code == 200:
        with open('test_enriched_output.xlsx', 'wb') as f:
            f.write(download_resp.content)
        print("✅ Enriched file downloaded: test_enriched_output.xlsx")
    else:
        print(f"❌ Download failed: {download_resp.status_code}")
        return False
    
    # Test 6: Check dashboard stats
    print("\n6️⃣ Checking dashboard statistics...")
    stats_resp = requests.get(f"{BASE_URL}/jobs/stats", headers=headers)
    
    if stats_resp.status_code == 200:
        stats = stats_resp.json()
        print(f"✅ Dashboard stats retrieved:")
        print(f"   Total Jobs: {stats.get('totalJobs', 0)}")
        print(f"   Leads Processed: {stats.get('leadsProcessed', 0)}")
        print(f"   Average Score: {stats.get('averageScore', 0):.2f}")
    else:
        print(f"❌ Stats retrieval failed: {stats_resp.status_code}")
    
    print("\n✨ All tests completed successfully!")
    return True

if __name__ == "__main__":
    success = test_system()
    sys.exit(0 if success else 1)
```

## Testing with Mock Data

For quick testing without API keys, set `USE_MOCK_APIS=true` in your backend `.env` file. This will:

- Return sample data for all OSINT services
- Generate random scores
- Complete jobs quickly
- Not require any external API keys

## Performance Testing

### Load Test Script

Create `load_test.py`:

```python
#!/usr/bin/env python3
import concurrent.futures
import requests
import time
import statistics

BASE_URL = "http://localhost:3000/api"

def create_user_and_upload(user_num):
    # Create unique user
    signup_data = {
        "email": f"loadtest_{user_num}_{int(time.time())}@example.com",
        "password": "Test123!",
        "company": f"Load Test Company {user_num}"
    }
    
    start_time = time.time()
    
    # Signup
    signup_resp = requests.post(f"{BASE_URL}/auth/signup", json=signup_data)
    if signup_resp.status_code != 201:
        return None
    
    token = signup_resp.json()['token']
    headers = {"Authorization": f"Bearer {token}"}
    
    # Upload file
    csv_content = f"""Domain,Company Name,Contact Email,Industry
example{user_num}.com,Example {user_num},test@example{user_num}.com,Technology"""
    
    files = {'file': (f'test_{user_num}.csv', csv_content, 'text/csv')}
    
    upload_resp = requests.post(
        f"{BASE_URL}/upload",
        headers=headers,
        files=files
    )
    
    end_time = time.time()
    
    if upload_resp.status_code == 200:
        return end_time - start_time
    else:
        return None

def run_load_test(num_users=10):
    print(f"🚀 Running load test with {num_users} concurrent users...\n")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [executor.submit(create_user_and_upload, i) for i in range(num_users)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]
    
    successful_times = [r for r in results if r is not None]
    
    if successful_times:
        print(f"\n📊 Load Test Results:")
        print(f"   Successful requests: {len(successful_times)}/{num_users}")
        print(f"   Average time: {statistics.mean(successful_times):.2f}s")
        print(f"   Min time: {min(successful_times):.2f}s")
        print(f"   Max time: {max(successful_times):.2f}s")
        print(f"   Median time: {statistics.median(successful_times):.2f}s")
    else:
        print("❌ All requests failed")

if __name__ == "__main__":
    run_load_test(10)
```

## Troubleshooting

### Common Issues

1. **Services won't start**
   - Check if ports 3010, 3011, 6379 are available
   - Run `docker-compose down` and try again
   - Check Docker logs: `docker-compose logs`

2. **File upload fails**
   - Ensure file is CSV or Excel format
   - Check file size (max 10MB by default)
   - Verify JWT token is valid

3. **WebSocket not connecting**
   - Check CORS settings in backend
   - Ensure token is included in socket auth
   - Check browser console for errors

4. **Jobs stuck in processing**
   - Check Redis is running: `docker-compose ps`
   - View worker logs: `docker-compose logs worker`
   - Check API keys if not using mock mode

### Debug Mode

Enable debug logging by setting in backend `.env`:

```env
NODE_ENV=development
LOG_LEVEL=debug
```

Then restart services to see detailed logs.

## Next Steps

After successful testing:

1. Configure real API keys for production use
2. Set up monitoring and alerting
3. Configure backup strategies
4. Implement rate limiting for production
5. Add SSL certificates for HTTPS
6. Set up CI/CD pipeline with automated tests
# WebSocket API Documentation

## Overview

The Lead Scoring & OSINT system provides real-time updates for job processing via WebSocket connections. This allows clients to receive immediate notifications about job progress, status changes, and log entries.

## Connection

### Endpoint
```
ws://localhost:3000 (development)
wss://yourdomain.com (production)
```

### Authentication
The WebSocket connection requires JWT authentication. Include the JWT token in the connection handshake:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token-here'
  }
});
```

## Events

### Client → Server Events

#### `subscribe-job`
Subscribe to updates for a specific job.

```javascript
socket.emit('subscribe-job', jobId);
```

#### `unsubscribe-job`
Unsubscribe from job updates.

```javascript
socket.emit('unsubscribe-job', jobId);
```

### Server → Client Events

#### `job-status`
Sent when subscribing to a job, contains current job status.

```javascript
socket.on('job-status', (data) => {
  console.log('Job status:', data);
  // {
  //   jobId: 'uuid',
  //   status: 'processing',
  //   progress: 45,
  //   total_leads: 100,
  //   processed_leads: 45,
  //   enriched_leads: 40,
  //   high_score_leads: 12,
  //   error_message: null,
  //   recentLogs: [...]
  // }
});
```

#### `job-update`
Real-time updates during job processing.

```javascript
socket.on('job-update', (update) => {
  console.log('Job update:', update);
  // Update types:
  // - progress: { type: 'progress', progress: 50, processedLeads: 50, totalLeads: 100 }
  // - status: { type: 'status', status: 'completed', message: 'Job completed successfully' }
  // - log: { type: 'log', log: { level: 'info', message: 'Processing lead...', timestamp: '...' } }
  // - complete: { type: 'complete', status: 'completed', results: {...} }
  // - error: { type: 'error', status: 'failed', error: 'Error message' }
});
```

#### `error`
Error notifications.

```javascript
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
  // { message: 'Error description' }
});
```

## Example Usage

### React Hook Example

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function useJobUpdates(jobId, token) {
  const [jobStatus, setJobStatus] = useState(null);
  const [updates, setUpdates] = useState([]);
  
  useEffect(() => {
    if (!jobId || !token) return;
    
    const socket = io('http://localhost:3000', {
      auth: { token }
    });
    
    socket.on('connect', () => {
      console.log('Connected to WebSocket');
      socket.emit('subscribe-job', jobId);
    });
    
    socket.on('job-status', (status) => {
      setJobStatus(status);
    });
    
    socket.on('job-update', (update) => {
      setUpdates(prev => [...prev, update]);
      
      if (update.type === 'progress') {
        setJobStatus(prev => ({
          ...prev,
          progress: update.progress,
          processed_leads: update.processedLeads
        }));
      } else if (update.type === 'complete') {
        setJobStatus(prev => ({
          ...prev,
          status: 'completed',
          ...update.results
        }));
      }
    });
    
    socket.on('error', (error) => {
      console.error('Job error:', error);
    });
    
    return () => {
      socket.emit('unsubscribe-job', jobId);
      socket.disconnect();
    };
  }, [jobId, token]);
  
  return { jobStatus, updates };
}
```

### Vue.js Example

```javascript
export default {
  data() {
    return {
      socket: null,
      jobStatus: null,
      updates: []
    };
  },
  
  mounted() {
    this.connectWebSocket();
  },
  
  beforeDestroy() {
    if (this.socket) {
      this.socket.emit('unsubscribe-job', this.jobId);
      this.socket.disconnect();
    }
  },
  
  methods: {
    connectWebSocket() {
      this.socket = io('http://localhost:3000', {
        auth: {
          token: this.$store.state.auth.token
        }
      });
      
      this.socket.on('connect', () => {
        this.socket.emit('subscribe-job', this.jobId);
      });
      
      this.socket.on('job-status', (status) => {
        this.jobStatus = status;
      });
      
      this.socket.on('job-update', (update) => {
        this.updates.push(update);
        this.handleUpdate(update);
      });
    },
    
    handleUpdate(update) {
      switch (update.type) {
        case 'progress':
          this.jobStatus.progress = update.progress;
          this.jobStatus.processed_leads = update.processedLeads;
          break;
        case 'complete':
          this.jobStatus.status = 'completed';
          Object.assign(this.jobStatus, update.results);
          break;
        case 'error':
          this.jobStatus.status = 'failed';
          this.jobStatus.error_message = update.error;
          break;
      }
    }
  }
};
```

## Server-Side Implementation

The WebSocket service is integrated with the job processing worker and automatically emits updates:

1. **Progress Updates**: Emitted every time a batch of leads is processed
2. **Log Entries**: Real-time streaming of processing logs
3. **Status Changes**: Immediate notification of status transitions
4. **Completion/Error**: Final job results or error details

## Security Considerations

1. **Authentication**: All connections require valid JWT tokens
2. **Authorization**: Users can only subscribe to their own jobs
3. **Rate Limiting**: Connection attempts are rate-limited
4. **Input Validation**: Job IDs are validated before subscription

## Troubleshooting

### Connection Issues
- Ensure JWT token is valid and not expired
- Check CORS configuration allows WebSocket connections
- Verify firewall/proxy settings allow WebSocket protocol

### Missing Updates
- Confirm job ID is correct
- Check if user has permission to view the job
- Verify the job exists and is actively processing

### Performance
- Unsubscribe from jobs when no longer needed
- Implement reconnection logic for network interruptions
- Consider batching updates for high-frequency events
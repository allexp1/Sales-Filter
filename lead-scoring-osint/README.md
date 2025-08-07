# Lead Scoring OSINT Platform

A comprehensive lead enrichment and scoring system that leverages Open Source Intelligence (OSINT) to provide detailed insights about potential business leads.

## 🚀 Features

- **Multi-Source OSINT Data Collection**
  - DNS History & Reverse Lookup (SecurityTrails)
  - Technology Stack Fingerprinting (BuiltWith/Wappalyzer)
  - Traffic Estimates (SimilarWeb)
  - Business Information (Google Places/Yelp)
  - Email Risk Assessment (HIBP/Hunter)
  - GitHub Developer Presence
  - Web Archive History (Wayback Machine)
  - Security Scans (Shodan/Censys)

- **Intelligent Lead Scoring**
  - Automated scoring based on 8+ data points
  - Customizable scoring algorithms
  - Industry-specific scoring models

- **Real-Time Processing**
  - WebSocket-based live updates
  - Progress tracking and logging
  - Batch processing capabilities

- **User Management**
  - JWT-based authentication
  - Subscription plans with credit system
  - Stripe payment integration

- **Data Export**
  - Enriched Excel/CSV downloads
  - API access for integrations
  - Customizable report formats

## 🛠️ Technology Stack

### Backend
- Node.js + Express.js
- SQLite database
- Redis for job queuing
- Bull for job processing
- Socket.io for WebSockets
- JWT authentication
- Stripe payment processing

### Frontend
- React 18 with Hooks
- React Router v6
- Tailwind CSS
- Recharts for data visualization
- Socket.io client
- Axios for API calls

### DevOps
- Docker & Docker Compose
- PM2 for process management
- Nginx reverse proxy

## 📋 Prerequisites

- Node.js 16+ and npm/yarn
- Redis server
- SQLite3
- Docker (optional)
- OSINT API keys (see Configuration)

## 🔧 Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/lead-scoring-osint.git
cd lead-scoring-osint
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 4. Set up Environment Variables

#### Backend (.env)
```bash
cd ../backend
cp .env.example .env
# Edit .env with your configuration
```

#### Frontend (.env)
```bash
cd ../frontend
cp .env.example .env
# Edit .env with your configuration
```

### 5. Initialize Database

```bash
cd ../backend
npm run migrate
```

## ⚙️ Configuration

### Required API Keys

You'll need to obtain API keys for the following services:

1. **SecurityTrails** - [Get API Key](https://securitytrails.com/app/api)
2. **BuiltWith** - [Get API Key](https://api.builtwith.com/)
3. **Wappalyzer** - [Get API Key](https://www.wappalyzer.com/api/)
4. **SimilarWeb** - [Get API Key](https://www.similarweb.com/api/)
5. **Google Places** - [Get API Key](https://developers.google.com/places/web-service/get-api-key)
6. **Yelp** - [Get API Key](https://www.yelp.com/developers)
7. **Have I Been Pwned** - [Get API Key](https://haveibeenpwned.com/API/Key)
8. **Hunter.io** - [Get API Key](https://hunter.io/api)
9. **GitHub** - [Create Personal Access Token](https://github.com/settings/tokens)
10. **Shodan** - [Get API Key](https://account.shodan.io/)
11. **Censys** - [Get API Key](https://censys.io/api)
12. **Stripe** - [Get API Keys](https://dashboard.stripe.com/apikeys)

### Environment Variables

See `.env.example` files in both backend and frontend directories for all configuration options.

## 🚀 Running the Application

### Development Mode

#### Start Redis
```bash
redis-server
```

#### Start Backend
```bash
cd backend
npm run dev
```

#### Start Frontend
```bash
cd frontend
npm start
```

The application will be available at:
- Frontend: http://localhost:3011
- Backend API: http://localhost:3010
- WebSocket: ws://localhost:3010

### Production Mode

#### Build Frontend
```bash
cd frontend
npm run build
```

#### Start Backend with PM2
```bash
cd backend
npm install -g pm2
pm2 start ecosystem.config.js
```

## 🐳 Docker Setup

### Using Docker Compose

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Individual Docker Commands

```bash
# Build backend
docker build -t lead-scorer-backend ./backend

# Build frontend
docker build -t lead-scorer-frontend ./frontend

# Run Redis
docker run -d -p 6379:6379 redis:alpine

# Run backend
docker run -d -p 3010:3010 \
  --env-file ./backend/.env \
  lead-scorer-backend

# Run frontend
docker run -d -p 3011:80 lead-scorer-frontend
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
npm run test:coverage
```

### Frontend Tests
```bash
cd frontend
npm test
npm run test:coverage
```

### E2E Tests
```bash
cd e2e
npm test
```

## 📚 API Documentation

Comprehensive API documentation is available in [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

### Quick API Reference

- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/upload` - Upload leads file
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:jobId/download` - Download results
- `WS /` - WebSocket connection for real-time updates

## 🌐 Deployment

### Heroku Deployment

```bash
# Create Heroku app
heroku create your-app-name

# Add Redis addon
heroku addons:create heroku-redis:hobby-dev

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret
# ... set all other env variables

# Deploy
git push heroku main
```

### AWS Deployment

See [AWS_DEPLOYMENT.md](./docs/AWS_DEPLOYMENT.md) for detailed instructions.

### Digital Ocean Deployment

See [DO_DEPLOYMENT.md](./docs/DO_DEPLOYMENT.md) for detailed instructions.

## 📁 Project Structure

```
lead-scoring-osint/
├── backend/
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # OSINT services
│   │   ├── middleware/     # Express middleware
│   │   ├── workers/        # Job processing
│   │   ├── queues/         # Bull queues
│   │   └── db/             # Database setup
│   ├── migrations/         # Database migrations
│   └── uploads/            # File uploads
├── frontend/
│   ├── src/
│   │   ├── pages/          # React pages
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   ├── services/       # API services
│   │   └── hooks/          # Custom hooks
│   └── public/             # Static assets
└── docker-compose.yml      # Docker configuration
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow ESLint configuration
- Write tests for new features
- Update documentation
- Use conventional commits

## 🐛 Troubleshooting

### Common Issues

1. **Redis Connection Error**
   - Ensure Redis is running: `redis-cli ping`
   - Check Redis URL in .env

2. **Database Migration Failed**
   - Delete `database.sqlite` and run migrations again
   - Check file permissions

3. **OSINT API Errors**
   - Verify API keys are correct
   - Check API rate limits
   - Enable `MOCK_OSINT_APIS=true` for testing

4. **WebSocket Connection Failed**
   - Check CORS settings
   - Verify WebSocket URL matches backend

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- Your Name - Initial work - [YourGitHub](https://github.com/yourusername)

## 🙏 Acknowledgments

- OSINT data providers for their excellent APIs
- Open source community for the amazing tools
- Contributors and testers

## 📞 Support

- Email: support@leadscorer.com
- Documentation: [https://docs.leadscorer.com](https://docs.leadscorer.com)
- Issues: [GitHub Issues](https://github.com/yourusername/lead-scoring-osint/issues)

---

Made with ❤️ by the Lead Scorer team
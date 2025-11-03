# MediTrack AI - Intelligent Medication Reminder Agent

MediTrack AI is an intelligent medication reminder agent designed to help both patients and caregivers manage and adhere to medication schedules effortlessly. It's built using Mastra (for AI-driven understanding and intent extraction) and integrates with Telex.im via the A2A protocol, ensuring all communications are structured in JSON for consistency and automation.

## 🚀 Features

- **Natural Language Processing**: Add medications using simple conversational commands
- **Smart Scheduling**: Automatically calculates reminder times based on frequency
- **Dual Role Support**: Works for both patients and caregivers
- **Adherence Tracking**: Monitors medication compliance and provides insights
- **Flexible Reminders**: Supports daily, 6-hourly, 8-hourly, and 12-hourly schedules
- **Real-time Confirmations**: Mark medications as taken, snooze, or skip doses
- **Caregiver Management**: Manage medications for multiple patients
- **A2A Protocol Integration**: Full compliance with Telex.im A2A messaging

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB 6.0+
- Redis (optional, for caching)
- Mastra API key (for AI features)
- Telex.im account and channel ID

## 🛠️ Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/meditrack-ai.git
   cd meditrack-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

### Docker Deployment

1. **Using Docker Compose (Recommended)**
   ```bash
   docker-compose up -d
   ```

2. **Using Docker**
   ```bash
   docker build -t meditrack-ai .
   docker run -p 3000:3000 --env-file .env meditrack-ai
   ```

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|-----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment |
| `MONGODB_URI` | Yes | - | MongoDB connection string |
| `MASTRA_API_KEY` | No | - | Mastra API key for AI features |
| `MASTRA_AGENT_ID` | No | medication-agent | Mastra agent ID |
| `TELEX_WEBHOOK_SECRET` | No | - | Telex webhook secret |
| `TELEX_API_BASE_URL` | No | https://api.telex.im | Telex API base URL |
| `JWT_SECRET` | No | - | JWT signing secret |
| `SCHEDULER_ENABLED` | No | true | Enable scheduler service |
| `TIMEZONE` | No | UTC | Default timezone |

### Database Setup

1. **MongoDB**
   - Install MongoDB 6.0+
   - Create database `meditrack-ai`
   - Create indexes for optimal performance

2. **Indexes**
   ```javascript
   // Users collection
   db.users.createIndex({ "telexId": 1 }, { unique: true })
   db.users.createIndex({ "role": 1 })
   db.users.createIndex({ "isActive": 1 })
   
   // Medications collection
   db.medications.createIndex({ "userId": 1 })
   db.medications.createIndex({ "isActive": 1 })
   
   // Schedules collection
   db.schedules.createIndex({ "medicationId": 1 })
   db.schedules.createIndex({ "reminderTime": 1 })
   db.schedules.createIndex({ "status": 1 })
   ```

## 📚 API Documentation

### A2A Webhook Endpoints

#### POST `/webhook/a2a`
Handle incoming A2A webhook events from Telex.im.

**Request Body:**
```json
{
  "event": "message.created | action.clicked",
  "data": {
    "sender_id": "string",
    "chat_id": "string",
    "message": {
      "text": "string",
      "id": "string"
    },
    "action_id": "string",
    "timestamp": "string"
  }
}
```

**Response:**
```json
{
  "version": "1.0",
  "response": {
    "type": "message",
    "data": {
      "text": "string",
      "actions": [
        {
          "type": "button",
          "label": "string",
          "action_id": "string",
          "style": "primary | secondary | danger"
        }
      ]
    }
  }
}
```

### REST API Endpoints

#### Users
- `GET /api/users` - List users
- `GET /api/users/:id` - Get user by ID
- `GET /api/users/telex/:telexId` - Get user by Telex ID
- `POST /api/users` - Create user
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user
- `GET /api/users/:id/medications` - Get user's medications
- `GET /api/users/:id/adherence` - Get user's adherence stats

#### Medications
- `GET /api/medications` - List medications
- `GET /api/medications/:id` - Get medication by ID
- `POST /api/medications` - Create medication
- `PATCH /api/medications/:id` - Update medication
- `DELETE /api/medications/:id` - Deactivate medication
- `GET /api/medications/:id/schedules` - Get medication schedules
- `GET /api/medications/:id/adherence` - Get medication adherence stats
- `POST /api/medications/:id/confirm` - Confirm medication dose

## 🤖 Usage Examples

### Adding Medications

**Natural Language Commands:**
- "Remind me to take Amoxicillin 500mg every 8 hours starting 6 AM for 5 days"
- "Add medication: Paracetamol 1000mg daily at 8 PM for 7 days"
- "Schedule Lisinopril 10mg every 24 hours starting 7 AM for 30 days"

### Managing Medications

**Commands:**
- "Show my medications" - Lists all active medications
- "I took my medicine" - Confirms most recent dose
- "Skip this dose" - Skips current reminder
- "Help" - Shows available commands

### Caregiver Features

**Managing Multiple Patients:**
- "Add medication for John: Metformin 500mg twice daily"
- "Show Jane's medications"
- "Mark John's 8 AM dose as taken"

## 🔧 Development

### Project Structure

```
src/
├── controllers/          # Request handlers
│   └── a2aController.ts
├── models/              # Database schemas
│   ├── User.ts
│   ├── Medication.ts
│   └── Schedule.ts
├── services/            # Business logic
│   ├── mastraService.ts
│   └── schedulerService.ts
├── utils/               # Utilities
│   ├── a2aFormatter.ts
│   └── logger.ts
├── middleware/           # Express middleware
│   └── errorHandler.ts
├── routes/              # API routes
│   ├── a2a.ts
│   ├── medications.ts
│   └── users.ts
├── config/              # Configuration
│   └── database.ts
└── app.ts              # Application entry point
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- a2aController.test.ts
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type checking
npm run type-check
```

## 📊 Monitoring

### Health Checks

- **Application Health**: `GET /health`
- **A2A Webhook Health**: `GET /webhook/a2a/health`
- **Database Health**: Automatic connection monitoring

### Metrics

The application exposes metrics for monitoring:
- Request/response times
- Error rates
- Database connection status
- Scheduler performance
- Medication adherence rates

### Logging

Logs are structured JSON with the following levels:
- `error` - Errors and exceptions
- `warn` - Warning messages
- `info` - General information
- `debug` - Debug information

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```bash
   export NODE_ENV=production
   export MONGODB_URI=mongodb://prod-server/meditrack-ai
   export MASTRA_API_KEY=your-production-key
   ```

2. **Build Application**
   ```bash
   npm run build
   ```

3. **Deploy with Docker**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Cloud Deployment Options

- **Railway**: Easy Node.js deployment
- **Render**: Full-stack deployment
- **AWS ECS**: Container orchestration
- **Google Cloud Run**: Serverless containers

## 🔒 Security

### Authentication
- JWT-based authentication for API endpoints
- Webhook signature verification for A2A messages
- Rate limiting on all endpoints

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CORS configuration

### Best Practices
- Regular dependency updates
- Security scanning
- Environment variable management
- Database encryption at rest

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests
- Update documentation
- Use conventional commit messages
- Keep PRs focused and small

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Full documentation](https://docs.meditrack-ai.com)
- **Issues**: [GitHub Issues](https://github.com/your-username/meditrack-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/meditrack-ai/discussions)

## 🙏 Acknowledgments

- [Mastra AI](https://mastra.ai) - Natural language processing
- [Telex.im](https://telex.im) - A2A protocol and messaging
- [MongoDB](https://mongodb.com) - Database
- [Express.js](https://expressjs.com) - Web framework

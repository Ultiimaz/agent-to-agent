# Docker Setup

This project includes full Docker support for easy deployment.

## Quick Start with Docker

### 1. Set Environment Variables

```bash
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

### 2. Build and Run

```bash
docker-compose up --build
```

That's it! The system will start:
- Backend API: http://localhost:3001
- Main App: http://localhost:3000
- Monitor: http://localhost:3002

## Docker Compose Services

### Backend Service
- **Container**: `agent-backend`
- **Port**: 3001
- **Image**: Node.js 18 Alpine
- **Health Check**: Included
- **Auto-restart**: Yes

### Monitor Service
- **Container**: `agent-monitor`
- **Port**: 3002
- **Image**: Nginx Alpine
- **Build**: Multi-stage (Node.js + Nginx)

### App Service
- **Container**: `agent-app`
- **Port**: 3000
- **Image**: Nginx Alpine
- **Build**: Multi-stage (Node.js + Nginx)

## Docker Commands

### Start Services
```bash
# Build and start in foreground
docker-compose up --build

# Build and start in background
docker-compose up -d --build

# Start without rebuilding
docker-compose up -d
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f monitor
docker-compose logs -f app
```

### Rebuild Services
```bash
# Rebuild all
docker-compose build

# Rebuild specific service
docker-compose build backend
```

### Service Status
```bash
# Check running containers
docker-compose ps

# Check resource usage
docker stats
```

## Environment Variables

Required in `.env` file:

```bash
OPENROUTER_API_KEY=your_key_here
```

Optional:
```bash
NODE_ENV=production
API_PORT=3001
MONITOR_PORT=3002
APP_PORT=3000
```

## Network Architecture

All services run on a shared Docker network:

```
agent-network (bridge)
├── agent-backend (3001)
├── agent-monitor (3002)
└── agent-app (3000)
```

Services can communicate using container names:
- `http://backend:3001`
- `ws://backend:3001`

## Health Checks

The backend includes a health check:
- **Endpoint**: `GET /api/health`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3
- **Start Period**: 40 seconds

Check health:
```bash
docker-compose ps
# Look for "healthy" status
```

## Production Deployment

### Using Docker Compose

```bash
# Pull and start
docker-compose pull
docker-compose up -d

# Update
docker-compose pull
docker-compose up -d --force-recreate
```

### Using Individual Images

Build and push:
```bash
# Backend
docker build -t your-registry/agent-backend:latest -f backend/Dockerfile .
docker push your-registry/agent-backend:latest

# Monitor
docker build -t your-registry/agent-monitor:latest frontend-monitor/
docker push your-registry/agent-monitor:latest

# App
docker build -t your-registry/agent-app:latest frontend-app/
docker push your-registry/agent-app:latest
```

## Troubleshooting

### Backend not starting
```bash
# Check logs
docker-compose logs backend

# Check if API key is set
docker-compose exec backend env | grep OPENROUTER
```

### Frontend can't connect to backend
- Ensure backend is running: `docker-compose ps`
- Check backend health: `docker-compose exec backend wget -qO- http://localhost:3001/api/health`
- Check WebSocket: Browser console should show connection

### Port conflicts
If ports are already in use, modify `docker-compose.yml`:
```yaml
ports:
  - "8001:3001"  # Change host port
```

### Rebuild from scratch
```bash
# Remove everything and rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## Development with Docker

For development, you can mount volumes:

```yaml
# Add to docker-compose.yml backend service
volumes:
  - ./backend:/app/backend
  - /app/node_modules
command: ["node", "--watch", "backend/server.js"]
```

Or use the native development setup:
```bash
npm run dev:backend
npm run dev:monitor
npm run dev:app
```

## Resource Requirements

Minimum:
- **CPU**: 2 cores
- **Memory**: 2GB
- **Disk**: 1GB

Recommended:
- **CPU**: 4 cores
- **Memory**: 4GB
- **Disk**: 2GB

## Security Notes

1. Never commit `.env` file
2. Use secrets management in production
3. Consider adding rate limiting
4. Use HTTPS in production
5. Restrict CORS origins

## Multi-Architecture Support

Build for multiple platforms:

```bash
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t your-registry/agent-backend:latest backend/
```

## Scaling

Scale specific services:

```bash
# Not recommended for this application as it uses in-memory state
# But if you add Redis/persistent storage:
docker-compose up -d --scale backend=3
```

Note: Current implementation uses in-memory event queue, so scaling backend would require:
1. Redis for event bus
2. Sticky sessions or shared state
3. Load balancer

## Monitoring

Add monitoring with Docker stats:

```bash
# Real-time stats
docker stats

# Resource usage
docker-compose top
```

Consider adding:
- Prometheus for metrics
- Grafana for dashboards
- ELK stack for logs

## Backup

Backup configuration:
```bash
# Backup .env
cp .env .env.backup

# Export images
docker save agent-backend:latest | gzip > backend.tar.gz
```

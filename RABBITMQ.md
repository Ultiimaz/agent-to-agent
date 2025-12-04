# RabbitMQ Event Bus

The system now supports **RabbitMQ** as the event bus for production deployments.

## Why RabbitMQ?

### In-Memory (Development)
- Fast and simple
- No external dependencies
- Events lost on restart
- Single backend instance only
- Good for development

### RabbitMQ (Production)
- **Persistent**: Events survive restarts
- **Scalable**: Multiple backend instances
- **Reliable**: Message acknowledgment
- **Durable**: Survives broker crashes
- **Observable**: Management UI included
- **Production-ready**: Battle-tested

## Quick Start

### With Docker (Recommended)

```bash
# RabbitMQ is included by default
docker-compose up --build

# Access:
# - App: http://localhost:3000
# - Monitor: http://localhost:3002
# - RabbitMQ Management: http://localhost:15672 (admin/admin123)
```

### Local Development with RabbitMQ

```bash
# 1. Start RabbitMQ
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=admin \
  -e RABBITMQ_DEFAULT_PASS=admin123 \
  rabbitmq:3.12-management-alpine

# 2. Set environment variable
export EVENT_BUS_TYPE=rabbitmq
export RABBITMQ_URL=amqp://admin:admin123@localhost:5672

# 3. Start backend
npm run dev:backend
```

## Configuration

### Environment Variables

```bash
# Event bus type
EVENT_BUS_TYPE=rabbitmq  # or 'memory' for in-memory

# RabbitMQ connection
RABBITMQ_URL=amqp://admin:admin123@localhost:5672
```

### Switching Between Event Buses

**In-Memory (default):**
```bash
EVENT_BUS_TYPE=memory
```

**RabbitMQ:**
```bash
EVENT_BUS_TYPE=rabbitmq
RABBITMQ_URL=amqp://username:password@host:5672
```

The system automatically uses the correct implementation based on `EVENT_BUS_TYPE`.

## Architecture

### RabbitMQ Setup

```
┌─────────────────────────────────────┐
│         RabbitMQ Broker             │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Exchange: agent_events      │  │
│  │  Type: fanout               │  │
│  │  Durable: true              │  │
│  └──────────────────────────────┘  │
│           │                         │
│           ├──────┬──────┬──────    │
│           ▼      ▼      ▼           │
│       Queue1  Queue2  Queue3  ...   │
│       (sub1)  (sub2)  (sub3)        │
└─────────────────────────────────────┘
```

### Message Flow

1. **Agent publishes event**
   ```javascript
   eventBus.publish({ type: 'agent_started', ... })
   ```

2. **Event goes to RabbitMQ**
   - Sent to `agent_events` exchange
   - Fanout to all bound queues
   - Message marked persistent

3. **Subscribers receive event**
   - Each subscriber has unique queue
   - Messages delivered in real-time
   - Manual acknowledgment

4. **Monitor displays event**
   - WebSocket forwards to frontend
   - Event shown in UI

## Features

### Persistence
- Messages survive broker restarts
- Durable exchange and queues
- Persistent message delivery

### Scalability
- Multiple backend instances supported
- Each instance publishes to same exchange
- All subscribers receive all events

### Reliability
- Manual message acknowledgment
- Failed messages can be requeued
- Dead letter queue support (future)

### Observability
- RabbitMQ Management UI at http://localhost:15672
- View exchanges, queues, messages
- Monitor connection and throughput

## RabbitMQ Management UI

Access at http://localhost:15672

**Default credentials:**
- Username: `admin`
- Password: `admin123`

**What you can see:**
- Active connections
- Exchange details
- Queue metrics
- Message rates
- Memory usage

## Implementation Details

### Publishing Events

```javascript
// backend/eventBusRabbitMQ.js
async publish(event) {
  const enrichedEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...event
  };

  // Publish to RabbitMQ
  this.channel.publish(
    'agent_events',  // Exchange
    '',              // Routing key
    Buffer.from(JSON.stringify(enrichedEvent)),
    {
      persistent: true,  // Survive restart
      contentType: 'application/json'
    }
  );
}
```

### Subscribing to Events

```javascript
// backend/eventBusRabbitMQ.js
async subscribe(callback) {
  // Create unique queue for this subscriber
  const queue = await this.channel.assertQueue('', {
    exclusive: true,   // Delete when disconnected
    autoDelete: true
  });

  // Bind to exchange
  await this.channel.bindQueue(queue.queue, 'agent_events', '');

  // Consume messages
  await this.channel.consume(queue.queue, (msg) => {
    const event = JSON.parse(msg.content.toString());
    callback(event);
    this.channel.ack(msg);  // Acknowledge
  });
}
```

## Multiple Backend Instances

With RabbitMQ, you can run multiple backends:

```yaml
# docker-compose.yml
services:
  backend-1:
    build: .
    environment:
      - EVENT_BUS_TYPE=rabbitmq
      - RABBITMQ_URL=amqp://rabbitmq:5672

  backend-2:
    build: .
    environment:
      - EVENT_BUS_TYPE=rabbitmq
      - RABBITMQ_URL=amqp://rabbitmq:5672
```

All backends publish to same exchange, all subscribers receive all events.

## Production Considerations

### Security
```bash
# Use strong credentials
RABBITMQ_DEFAULT_USER=secure_user
RABBITMQ_DEFAULT_PASS=strong_password_here

# Use TLS
RABBITMQ_URL=amqps://user:pass@host:5671
```

### Resource Limits
```yaml
# docker-compose.yml
rabbitmq:
  environment:
    - RABBITMQ_VM_MEMORY_HIGH_WATERMARK=1GB
  deploy:
    resources:
      limits:
        memory: 2G
        cpus: '2'
```

### Monitoring
- Enable Prometheus plugin
- Export metrics to monitoring system
- Set up alerts for queue depth, memory usage

### Clustering
For high availability, use RabbitMQ cluster:
```yaml
rabbitmq-1:
  environment:
    - RABBITMQ_ERLANG_COOKIE=secret_cookie
rabbitmq-2:
  environment:
    - RABBITMQ_ERLANG_COOKIE=secret_cookie
```

## Troubleshooting

### RabbitMQ not starting
```bash
# Check logs
docker-compose logs rabbitmq

# Check if port is available
lsof -i :5672
```

### Backend can't connect
```bash
# Check RabbitMQ is healthy
docker-compose ps

# Test connection
docker exec agent-backend wget -qO- http://rabbitmq:15672/api/overview
```

### Messages not being received
- Check exchange exists: RabbitMQ UI → Exchanges → `agent_events`
- Check queues are bound: RabbitMQ UI → Queues
- Check subscriber count in monitor UI

### Performance issues
- Check queue depth in RabbitMQ UI
- Monitor memory usage
- Consider increasing prefetch count

## Migration from In-Memory

To migrate from in-memory to RabbitMQ:

1. **No code changes needed** - just set environment variable
2. **Data is not migrated** - in-memory events are lost
3. **Start with Docker Compose** for easiest setup

```bash
# Before
EVENT_BUS_TYPE=memory

# After
EVENT_BUS_TYPE=rabbitmq
RABBITMQ_URL=amqp://rabbitmq:5672
```

## Development vs Production

### Development
```bash
# Use in-memory for fast iteration
EVENT_BUS_TYPE=memory
npm run dev:backend
```

### Production
```bash
# Use RabbitMQ for reliability
EVENT_BUS_TYPE=rabbitmq
docker-compose up -d
```

## Comparison Table

| Feature | In-Memory | RabbitMQ |
|---------|-----------|----------|
| Persistence | No | Yes |
| Multiple backends | No | Yes |
| Survives restart | No | Yes |
| External dependency | No | Yes |
| Setup complexity | Low | Medium |
| Performance | Very Fast | Fast |
| Production ready | No | Yes |
| Message acknowledgment | No | Yes |
| Management UI | No | Yes |

## Next Steps

For even more advanced features, consider:
- **Dead Letter Queues**: Handle failed messages
- **Message TTL**: Auto-expire old events
- **Priority Queues**: High-priority events first
- **Message Routing**: Route events by type
- **Federation**: Connect multiple RabbitMQ clusters

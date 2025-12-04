# Agent-to-Agent System

An **event-driven multi-agent architecture** with real-time monitoring, built with React and Node.js.

## Architecture

```
                    ┌──────────────────────────────┐
                    │       EVENT BUS              │
                    │  (Pub/Sub Message Queue)     │
                    └──────────────────────────────┘
                               ▲         │
                    PUBLISH    │         │    SUBSCRIBE
                               │         ▼
           ┌───────────────────┴─────────────────────┐
           │                                          │
           │                                          │
    ┌──────▼─────┐                            ┌──────▼─────┐
    │  Agents    │                            │  Monitor   │
    │ - Code     │                            │  (Port     │
    │ - Design   │                            │   3002)    │
    │ - Research │                            └────────────┘
    └────────────┘                            ┌──────▼─────┐
    ┌────────────┐                            │  App       │
    │Orchestrator│                            │  (Port     │
    │            │                            │   3000)    │
    └────────────┘                            └────────────┘
           │
           ▼
    ┌──────────────┐
    │  OpenRouter  │
    │  AI Models   │
    └──────────────┘
```

### How it Works

1. **Agents PUBLISH events** to the event bus when they:
   - Start a task
   - Complete a task
   - Need clarification
   - Call tools
   - Encounter errors

2. **Clients SUBSCRIBE** to the event bus:
   - Monitor UI displays all events in real-time
   - App UI listens for questions and results

3. **Event Bus** maintains:
   - Queue of all events
   - List of active subscribers
   - Real-time WebSocket broadcasting

## Features

- **Event Bus Architecture**: Pub/sub message queue where agents publish events and clients subscribe
- **Real-Time Monitoring**: WebSocket subscribers see all events live as they're published
- **Orchestrator Agent**: Coordinates multiple specialized agents to accomplish complex tasks
- **MCP Server Support**: Each agent can have specific MCP servers attached
- **Agent Questions**: Agents can publish question events for user clarification
- **OpenRouter Integration**: Uses various AI models through OpenRouter

## Agents

1. **Orchestrator Agent**: Plans and coordinates task execution across agents
2. **Code Agent**: Writes, reviews, and debugs code (Claude 3.5 Sonnet)
3. **Design Agent**: Creates UI/UX designs and frontend implementations (Claude 3.5 Sonnet)
4. **Research Agent**: Gathers information and provides recommendations (GPT-4 Turbo)

## Prerequisites

- Node.js 18+
- OpenRouter API key

## Setup

### Option 1: Docker (Recommended)

```bash
# 1. Set your OpenRouter API key
cp .env.example .env
# Edit .env and add: OPENROUTER_API_KEY=your_key_here

# 2. Start everything
docker-compose up --build
```

Access:
- App: http://localhost:3000
- Monitor: http://localhost:3002
- API: http://localhost:3001
- RabbitMQ Management: http://localhost:15672 (admin/admin123)

See [DOCKER.md](DOCKER.md) for detailed Docker instructions and [RABBITMQ.md](RABBITMQ.md) for RabbitMQ setup.

### Option 2: Local Development

#### 1. Install Dependencies

```bash
npm run install:all
```

This installs dependencies for the backend, monitor frontend, and app frontend.

#### 2. Set Environment Variables

Create a `.env` file in the root directory:

```bash
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Get your API key from: https://openrouter.ai/keys

#### 3. Start the System

Open three terminal windows:

**Terminal 1 - Backend:**
```bash
npm run dev:backend
```

**Terminal 2 - Monitor UI:**
```bash
npm run dev:monitor
```

**Terminal 3 - App UI:**
```bash
npm run dev:app
```

## Usage

1. Open http://localhost:3000 for the main application
2. Open http://localhost:3002 for the real-time monitor
3. Enter a request in the app (e.g., "Create a todo list application")
4. Watch the agents work together in the monitor
5. See the final result in the app

## Example Requests

- "Create a simple todo list application with React"
- "Design a modern landing page for a SaaS product"
- "Research the best practices for building REST APIs"
- "Build a calculator component with basic operations"
- "Create a responsive navigation bar with dropdown menus"

## Event Types

Agents publish various event types to the bus:

### Orchestrator Messages
- `orchestrator_started`: Task received
- `orchestrator_plan_created`: Execution plan created
- `orchestrator_delegating`: Delegating to an agent
- `orchestrator_completed`: Task completed
- `orchestrator_error`: Error occurred
- `orchestrator_needs_clarification`: Needs user input

### Agent Messages
- `agent_started`: Agent began task
- `agent_thinking`: Agent is processing
- `agent_tool_calls`: Agent is using tools
- `agent_completed`: Agent finished task
- `agent_error`: Agent encountered error
- `agent_question`: Agent needs clarification
- `agent_mcp_connected`: MCP server connected

## Adding MCP Servers to Agents

Edit `backend/server.js` to configure MCP servers for specific agents:

```javascript
const mcpConfigs = {
  code: [
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      tools: [
        {
          name: 'read_file',
          description: 'Read contents of a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' }
            }
          }
        }
      ]
    }
  ],
  design: [
    // Add MCP servers for design agent
  ]
};

// Initialize MCP servers for agents
await codeAgent.initializeMCPServers(mcpConfigs.code);
```

## API Endpoints

### GET /api/health
Health check endpoint

### GET /api/events
Get all events from the queue and subscriber count
```json
{
  "events": [...],
  "subscriberCount": 2
}
```

### POST /api/execute
Execute a request through the orchestrator
```json
{
  "request": "Create a todo list app"
}
```

### POST /api/agent/answer
Publish an answer event to the bus (for agent questions)
```json
{
  "agentId": "agent_id",
  "answer": "Your answer"
}
```

### DELETE /api/events
Clear all events from the queue

## Project Structure

```
agent-to-agent/
├── backend/
│   ├── server.js              # Main server with WebSocket
│   ├── messageQueue.js        # Event bus (pub/sub)
│   ├── agent.js              # Base agent class
│   ├── orchestrator.js       # Orchestrator agent
│   ├── mcpClient.js          # MCP server integration
│   └── agents/
│       ├── codeAgent.js      # Code specialist
│       ├── designAgent.js    # Design specialist
│       └── researchAgent.js  # Research specialist
├── frontend-monitor/          # Real-time monitoring UI
│   └── src/
│       ├── App.jsx
│       └── App.css
├── frontend-app/              # Main application UI
│   └── src/
│       ├── App.jsx
│       └── App.css
└── package.json
```

## Extending the System

### Adding a New Agent

1. Create a new agent file in `backend/agents/`:

```javascript
import { Agent } from '../agent.js';

export class MyAgent extends Agent {
  constructor() {
    super({
      id: 'my-agent',
      name: 'My Agent',
      role: 'specialist',
      systemPrompt: 'Your specialized prompt...',
      model: 'anthropic/claude-3.5-sonnet'
    });
  }
}
```

2. Register it in `backend/server.js`:

```javascript
import { MyAgent } from './agents/myAgent.js';

const myAgent = new MyAgent();
orchestrator.registerAgent(myAgent);
```

### Customizing Event Display

Edit `frontend-monitor/src/App.jsx` to add custom styling for your event types:

```javascript
const EVENT_COLORS = {
  my_custom_event: '#ff6b6b',
  // ... other colors
};
```

### Publishing Custom Events

From any agent, publish events to the bus:

```javascript
import { eventBus } from './messageQueue.js';

eventBus.publish({
  type: 'my_custom_event',
  data: 'some data',
  timestamp: new Date().toISOString()
});
```

## Troubleshooting

### Agents not responding
- Check that OPENROUTER_API_KEY is set correctly
- Verify you have credits on OpenRouter
- Check backend logs for errors

### WebSocket connection failed
- Ensure backend is running on port 3001
- Check for CORS issues
- Verify firewall settings

### Events not appearing in monitor
- Check that agents are publishing events (look for [EVENT BUS] logs in backend)
- Verify WebSocket connection is established
- Check subscriber count in monitor UI

### MCP servers not working
- Check that the MCP server command is correct
- Verify the server binary is installed
- Check backend logs for MCP connection errors

## Event Bus Details

The system supports two event bus implementations:

### In-Memory (Development)
- Lightweight pub/sub using Node.js EventEmitter
- Fast and simple, no external dependencies
- Events stored in memory (up to 1000 events)
- Events lost on restart
- Good for development

### RabbitMQ (Production)
- Production-ready message broker
- Persistent events that survive restarts
- Supports multiple backend instances
- Message acknowledgment and durability
- Management UI included

**Switch between them:**
```bash
# In-memory (default)
EVENT_BUS_TYPE=memory

# RabbitMQ
EVENT_BUS_TYPE=rabbitmq
RABBITMQ_URL=amqp://rabbitmq:5672
```

Docker Compose includes RabbitMQ by default. See [RABBITMQ.md](RABBITMQ.md) for details.

Example flow:
```
1. Agent publishes event → eventBus.publish({ type: 'agent_started', ... })
2. Event bus stores event (memory or RabbitMQ)
3. Event bus broadcasts to all subscribers
4. WebSocket server receives event and sends to connected clients
5. Monitor UI displays event in real-time
```

## License

MIT

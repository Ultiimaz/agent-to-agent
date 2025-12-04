# Quick Start Guide

## Method 1: Docker (Easiest)

```bash
# Step 1: Configure
cp .env.example .env
# Edit .env and add: OPENROUTER_API_KEY=your_key_here

# Step 2: Start
docker-compose up --build

# Done! Access:
# - App: http://localhost:3000
# - Monitor: http://localhost:3002
```

## Method 2: Local Development

### Step 1: Install Dependencies

```bash
npm run install:all
```

This will install dependencies for:
- Backend server
- Frontend monitor (port 3002)
- Frontend app (port 3000)

### Step 2: Configure OpenRouter

1. Get your API key from https://openrouter.ai/keys
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and add your OpenRouter API key:
   ```
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```

### Step 3: Start the System

Open three terminal windows:

**Terminal 1 - Backend (Port 3001):**
```bash
npm run dev:backend
```

**Terminal 2 - Monitor Dashboard (Port 3002):**
```bash
npm run dev:monitor
```

**Terminal 3 - Main App (Port 3000):**
```bash
npm run dev:app
```

### Step 4: Use the System

1. Open http://localhost:3000 - Main application interface
2. Open http://localhost:3002 - Real-time agent monitor
3. Enter a request like: "Create a simple todo list application with React"
4. Watch the agents collaborate in real-time in the monitor
5. See the final result in the main app

## Architecture Overview

```
                  ┌─────────────────┐
                  │   EVENT BUS     │
                  │ (Pub/Sub Queue) │
                  └─────────────────┘
                      ▲         │
           PUBLISH    │         │    SUBSCRIBE
                      │         ▼
        ┌─────────────┴──────────────┐
        │                            │
    Agents                      Monitor UI
   (Publish)                   (Subscribe)
```

### Event Flow

1. User submits request to App
2. Orchestrator agent **publishes** events to the bus:
   - `orchestrator_started`
   - `orchestrator_plan_created`
   - `orchestrator_delegating`
3. Specialized agents **publish** their events:
   - `agent_started`
   - `agent_thinking`
   - `agent_completed`
4. Monitor UI **subscribes** to the bus and displays all events in real-time
5. Final result returned to App

## Event Bus System

The system uses a **pub/sub event bus**:
- **EventEmitter** (Node.js) as the event bus backbone
- **Publishers**: Agents publish events to the bus
- **Subscribers**: WebSocket clients subscribe to receive events
- **Queue**: All events stored in memory (up to 1000)

### How It Works

```
Agent → eventBus.publish({ type: 'agent_started', ... })
                        ↓
                  Event Queue
                        ↓
              WebSocket Broadcast
                        ↓
               Monitor Displays Event
```

Every agent action publishes events to the bus:
- `orchestrator_started` - Task received
- `orchestrator_plan_created` - Plan ready
- `agent_thinking` - Agent processing
- `agent_completed` - Agent finished
- `orchestrator_delegating` - Assigning to agent

## Adding MCP Servers

Edit `backend/server.js` and add MCP configurations:

```javascript
const mcpConfigs = {
  code: [
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      tools: [...]
    }
  ]
};

await codeAgent.initializeMCPServers(mcpConfigs.code);
```

## Example Requests

- "Create a simple todo list application with React"
- "Design a modern landing page for a SaaS product"
- "Research the best practices for building REST APIs"
- "Build a calculator component with basic operations"
- "Create a responsive navigation bar"

## Troubleshooting

**Agents not responding?**
- Check your OpenRouter API key is set
- Verify you have credits at https://openrouter.ai/

**WebSocket connection failed?**
- Make sure backend is running on port 3001
- Check firewall settings

**MCP servers not working?**
- Verify the MCP server binary is installed
- Check backend logs for connection errors

import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { eventBus } from './messageQueue.js';
import { OrchestratorAgent } from './orchestrator.js';
import { CodeAgent } from './agents/codeAgent.js';
import { DesignAgent } from './agents/designAgent.js';
import { ResearchAgent } from './agents/researchAgent.js';

console.log('='.repeat(60));
console.log('EVENT BUS ARCHITECTURE');
console.log('='.repeat(60));

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const orchestrator = new OrchestratorAgent();
const codeAgent = new CodeAgent();
const designAgent = new DesignAgent();
const researchAgent = new ResearchAgent();

orchestrator.registerAgent(codeAgent);
orchestrator.registerAgent(designAgent);
orchestrator.registerAgent(researchAgent);

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
        },
        {
          name: 'write_file',
          description: 'Write contents to a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' }
            }
          }
        }
      ]
    }
  ]
};

if (process.env.OPENROUTER_API_KEY) {
  console.log('OpenRouter API key found');
} else {
  console.warn('WARNING: OPENROUTER_API_KEY not set. Agents will not function.');
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/events', (req, res) => {
  res.json({
    events: eventBus.getEventQueue(),
    subscriberCount: eventBus.getSubscriberCount()
  });
});

app.post('/api/execute', async (req, res) => {
  const { request } = req.body;

  if (!request) {
    return res.status(400).json({ error: 'Request is required' });
  }

  try {
    const result = await orchestrator.orchestrate(request);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agent/answer', (req, res) => {
  const { agentId, answer } = req.body;

  eventBus.publish({
    type: 'agent_answer',
    agentId,
    answer
  });

  res.json({ success: true });
});

app.delete('/api/events', (req, res) => {
  eventBus.clearQueue();
  res.json({ success: true });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[WEBSOCKET] Client connected - subscribing to event bus');

  // Send existing events to new subscriber
  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to event bus',
    events: eventBus.getEventQueue()
  }));

  // Subscribe to event bus
  const unsubscribe = eventBus.subscribe((event) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });

  ws.on('close', () => {
    console.log('[WEBSOCKET] Client disconnected - unsubscribing from event bus');
    unsubscribe();
  });

  ws.on('error', (error) => {
    console.error('[WEBSOCKET] Error:', error);
  });
});

console.log('='.repeat(60));
console.log('Agent-to-Agent System initialized');
console.log('Registered Agents:', Array.from(orchestrator.availableAgents.keys()));
console.log('Event Bus Ready - Agents will PUBLISH events');
console.log('WebSocket Server Ready - Clients can SUBSCRIBE to events');
console.log('='.repeat(60));

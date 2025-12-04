# Event Bus Architecture

This system uses a **pub/sub event bus** pattern for agent-to-agent communication.

## Core Concept

```
Publishers (Agents) → Event Bus → Subscribers (Monitors)
```

### Event Bus (`backend/messageQueue.js`)

The event bus is a central message broker that:
- Receives events from publishers (agents)
- Stores events in a queue
- Broadcasts events to all subscribers in real-time

## Publishing Events

Agents publish events to the bus whenever something happens:

```javascript
import { eventBus } from './messageQueue.js';

// Agent publishes an event
eventBus.publish({
  type: 'agent_started',
  agentId: 'code',
  agentName: 'Code Agent',
  task: 'Write a React component'
});
```

When published:
1. Event gets a unique ID and timestamp
2. Event is added to the queue
3. Event is broadcast to all subscribers via WebSocket

## Subscribing to Events

Clients subscribe to receive events in real-time:

```javascript
// Backend WebSocket server subscribes
const unsubscribe = eventBus.subscribe((event) => {
  // Send event to WebSocket client
  ws.send(JSON.stringify(event));
});

// Clean up when done
unsubscribe();
```

## Event Flow Example

Let's trace what happens when a user asks to "Create a todo app":

### 1. Request Initiated
```
User → Frontend App → POST /api/execute
```

### 2. Orchestrator Publishes Events
```javascript
eventBus.publish({
  type: 'orchestrator_started',
  request: 'Create a todo app'
});
```

### 3. Event Bus Processes
- Adds event to queue
- Broadcasts to all subscribers

### 4. Monitor Receives Event
```
WebSocket → Monitor UI → Display Event
```

### 5. Orchestrator Delegates
```javascript
eventBus.publish({
  type: 'orchestrator_delegating',
  agentId: 'code',
  task: 'Write React todo component'
});
```

### 6. Code Agent Publishes Events
```javascript
eventBus.publish({ type: 'agent_started', ... });
eventBus.publish({ type: 'agent_thinking', ... });
eventBus.publish({ type: 'agent_completed', result: '...' });
```

### 7. Orchestrator Completes
```javascript
eventBus.publish({
  type: 'orchestrator_completed',
  result: 'Todo app created successfully'
});
```

## Key Benefits

1. **Decoupling**: Agents don't need to know about monitors
2. **Real-time**: Events appear instantly in all subscribers
3. **Observable**: Every action is visible in the monitor
4. **Extensible**: Easy to add new event types or subscribers
5. **Debuggable**: Full history of all events in the queue

## Event Structure

All events have this structure:

```javascript
{
  id: 'uuid',                    // Auto-generated
  timestamp: '2024-01-01T00:00:00.000Z',  // Auto-generated
  type: 'event_type',            // Required
  // ... custom fields
}
```

## Common Event Types

### Orchestrator Events
- `orchestrator_started` - Task received
- `orchestrator_plan_created` - Created execution plan
- `orchestrator_delegating` - Assigning task to agent
- `orchestrator_completed` - Task finished
- `orchestrator_error` - Error occurred

### Agent Events
- `agent_started` - Agent began task
- `agent_thinking` - Agent processing
- `agent_tool_calls` - Agent using tools
- `agent_completed` - Agent finished
- `agent_error` - Agent error
- `agent_question` - Agent needs input
- `agent_mcp_connected` - MCP server connected

## Adding Custom Events

1. Publish from any agent:
```javascript
eventBus.publish({
  type: 'my_custom_event',
  myData: 'some value'
});
```

2. Add color to monitor (`frontend-monitor/src/App.jsx`):
```javascript
const EVENT_COLORS = {
  my_custom_event: '#ff6b6b',
  // ...
};
```

3. Handle in monitor UI as needed

## Subscriber Management

The event bus tracks all subscribers:

```javascript
// Check subscriber count
eventBus.getSubscriberCount()  // Returns number of active subscribers

// View in monitor UI
// Shows subscriber count in header
```

## Queue Management

Events are stored in memory:
- Max 1000 events
- Old events automatically removed
- Can clear queue: `eventBus.clearQueue()`

## WebSocket Integration

The backend server acts as a bridge:

```javascript
// Server subscribes to event bus
const unsubscribe = eventBus.subscribe((event) => {
  // Broadcast to WebSocket clients
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
});

// Clean up when client disconnects
ws.on('close', () => {
  unsubscribe();
});
```

## Console Logging

The event bus logs all activity:
```
[EVENT BUS] Published: agent_started
[EVENT BUS] New subscriber: abc-123
[EVENT BUS] Unsubscribed: abc-123
[EVENT BUS] Queue cleared
```

## Example: Custom Agent with Events

```javascript
import { Agent } from './agent.js';
import { eventBus } from './messageQueue.js';

export class MyCustomAgent extends Agent {
  async customMethod() {
    // Publish custom event
    eventBus.publish({
      type: 'custom_agent_action',
      agentId: this.id,
      action: 'doing something special'
    });

    // Do work...

    eventBus.publish({
      type: 'custom_agent_done',
      agentId: this.id,
      result: 'Success!'
    });
  }
}
```

The monitor will automatically display these events in real-time!

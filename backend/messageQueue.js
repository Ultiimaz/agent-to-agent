/**
 * Event Bus / Message Queue
 *
 * Supports two implementations:
 * 1. In-Memory (development) - Fast, simple, events lost on restart
 * 2. RabbitMQ (production) - Persistent, scalable, survives restarts
 *
 * Set EVENT_BUS_TYPE environment variable:
 * - 'memory' (default) - Use in-memory EventEmitter
 * - 'rabbitmq' - Use RabbitMQ
 */

const eventBusType = process.env.EVENT_BUS_TYPE || 'memory';

let eventBus;

if (eventBusType === 'rabbitmq') {
  console.log('Using RabbitMQ Event Bus');
  const { eventBus: rabbitMQBus } = await import('./eventBusRabbitMQ.js');
  eventBus = rabbitMQBus;
} else {
  console.log('Using In-Memory Event Bus');
  const { eventBus: inMemoryBus } = await import('./eventBusInMemory.js');
  eventBus = inMemoryBus;
}

export { eventBus };

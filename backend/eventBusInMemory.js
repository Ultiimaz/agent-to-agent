import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * In-Memory Event Bus
 *
 * A simple pub/sub system for development where:
 * - Agents PUBLISH events to the bus
 * - Subscribers SUBSCRIBE to receive events
 * - All events are stored in memory (lost on restart)
 */
export class InMemoryEventBus extends EventEmitter {
  constructor() {
    super();
    this.eventQueue = [];
    this.maxQueueSize = 1000;
    this.subscribers = new Set();
  }

  /**
   * Publish an event to the bus
   * All subscribers will receive this event
   */
  publish(event) {
    const enrichedEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...event
    };

    // Add to queue
    this.eventQueue.push(enrichedEvent);

    // Maintain max queue size
    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue.shift();
    }

    // Emit to all subscribers
    this.emit('event', enrichedEvent);

    console.log(`[EVENT BUS] Published: ${enrichedEvent.type}`);

    return enrichedEvent;
  }

  /**
   * Subscribe to events on the bus
   */
  subscribe(callback) {
    const subscriber = {
      id: uuidv4(),
      callback
    };

    this.subscribers.add(subscriber);
    this.on('event', callback);

    console.log(`[EVENT BUS] New subscriber: ${subscriber.id}`);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(subscriber);
      this.off('event', callback);
      console.log(`[EVENT BUS] Unsubscribed: ${subscriber.id}`);
    };
  }

  /**
   * Get all events from the queue
   */
  getEventQueue() {
    return this.eventQueue;
  }

  /**
   * Clear the event queue
   */
  clearQueue() {
    this.eventQueue = [];
    this.emit('queue_cleared');
    console.log('[EVENT BUS] Queue cleared');
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount() {
    return this.subscribers.size;
  }
}

export const eventBus = new InMemoryEventBus();

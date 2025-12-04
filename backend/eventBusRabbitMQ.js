import amqp from 'amqplib';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * RabbitMQ Event Bus
 *
 * A production-ready pub/sub system using RabbitMQ where:
 * - Agents PUBLISH events to RabbitMQ exchange
 * - Subscribers create queues and SUBSCRIBE to receive events
 * - Messages are persistent and survive restarts
 * - Supports multiple backend instances
 */
export class RabbitMQEventBus extends EventEmitter {
  constructor(url = 'amqp://localhost') {
    super();
    this.url = url;
    this.connection = null;
    this.channel = null;
    this.exchangeName = 'agent_events';
    this.eventQueue = []; // Local cache for API access
    this.maxQueueSize = 1000;
    this.subscribers = new Set();
    this.isConnected = false;
  }

  /**
   * Connect to RabbitMQ
   */
  async connect() {
    try {
      console.log('[RABBITMQ] Connecting to', this.url);

      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Create fanout exchange for pub/sub
      await this.channel.assertExchange(this.exchangeName, 'fanout', {
        durable: true // Survive broker restart
      });

      // Handle connection errors
      this.connection.on('error', (err) => {
        console.error('[RABBITMQ] Connection error:', err);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        console.log('[RABBITMQ] Connection closed');
        this.isConnected = false;
        // Attempt reconnection
        setTimeout(() => this.connect(), 5000);
      });

      this.isConnected = true;
      console.log('[RABBITMQ] Connected successfully');

      return true;
    } catch (error) {
      console.error('[RABBITMQ] Connection failed:', error.message);
      this.isConnected = false;
      // Retry connection
      setTimeout(() => this.connect(), 5000);
      return false;
    }
  }

  /**
   * Publish an event to RabbitMQ
   */
  async publish(event) {
    const enrichedEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...event
    };

    // Add to local cache
    this.eventQueue.push(enrichedEvent);
    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue.shift();
    }

    // Publish to RabbitMQ
    if (this.isConnected && this.channel) {
      try {
        const message = Buffer.from(JSON.stringify(enrichedEvent));

        this.channel.publish(
          this.exchangeName,
          '', // Routing key (not used in fanout)
          message,
          {
            persistent: true, // Survive broker restart
            contentType: 'application/json',
            timestamp: Date.now()
          }
        );

        console.log(`[RABBITMQ] Published: ${enrichedEvent.type}`);
      } catch (error) {
        console.error('[RABBITMQ] Publish error:', error.message);
      }
    } else {
      console.warn('[RABBITMQ] Not connected, event cached locally only');
    }

    // Also emit locally for backwards compatibility
    this.emit('event', enrichedEvent);

    return enrichedEvent;
  }

  /**
   * Subscribe to events from RabbitMQ
   * Creates a unique queue for this subscriber
   */
  async subscribe(callback) {
    if (!this.isConnected || !this.channel) {
      console.warn('[RABBITMQ] Not connected, subscription delayed');
      // Wait for connection and retry
      setTimeout(() => this.subscribe(callback), 1000);
      return () => {};
    }

    try {
      // Create unique queue for this subscriber
      const queueName = `agent_events_${uuidv4()}`;
      const queue = await this.channel.assertQueue(queueName, {
        exclusive: true, // Delete when subscriber disconnects
        autoDelete: true
      });

      // Bind queue to exchange
      await this.channel.bindQueue(queue.queue, this.exchangeName, '');

      // Consume messages
      const consumerTag = await this.channel.consume(
        queue.queue,
        (msg) => {
          if (msg) {
            try {
              const event = JSON.parse(msg.content.toString());
              callback(event);

              // Acknowledge message
              this.channel.ack(msg);
            } catch (error) {
              console.error('[RABBITMQ] Message parse error:', error.message);
              // Reject message
              this.channel.nack(msg, false, false);
            }
          }
        },
        { noAck: false } // Manual acknowledgment
      );

      const subscriber = {
        id: uuidv4(),
        callback,
        consumerTag: consumerTag.consumerTag,
        queueName: queue.queue
      };

      this.subscribers.add(subscriber);
      console.log(`[RABBITMQ] New subscriber: ${subscriber.id}`);

      // Return unsubscribe function
      return async () => {
        try {
          if (this.channel) {
            await this.channel.cancel(subscriber.consumerTag);
            // Queue will auto-delete since it's exclusive
          }
          this.subscribers.delete(subscriber);
          console.log(`[RABBITMQ] Unsubscribed: ${subscriber.id}`);
        } catch (error) {
          console.error('[RABBITMQ] Unsubscribe error:', error.message);
        }
      };
    } catch (error) {
      console.error('[RABBITMQ] Subscribe error:', error.message);
      return () => {};
    }
  }

  /**
   * Get all events from local cache
   */
  getEventQueue() {
    return this.eventQueue;
  }

  /**
   * Clear the local event cache
   */
  clearQueue() {
    this.eventQueue = [];
    this.emit('queue_cleared');
    console.log('[RABBITMQ] Local queue cleared');
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount() {
    return this.subscribers.size;
  }

  /**
   * Close connection
   */
  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnected = false;
      console.log('[RABBITMQ] Connection closed gracefully');
    } catch (error) {
      console.error('[RABBITMQ] Close error:', error.message);
    }
  }
}

// Create singleton instance
const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
export const eventBus = new RabbitMQEventBus(rabbitmqUrl);

// Auto-connect on startup
eventBus.connect().catch(err => {
  console.error('[RABBITMQ] Initial connection failed:', err.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[RABBITMQ] Shutting down...');
  await eventBus.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[RABBITMQ] Shutting down...');
  await eventBus.close();
  process.exit(0);
});

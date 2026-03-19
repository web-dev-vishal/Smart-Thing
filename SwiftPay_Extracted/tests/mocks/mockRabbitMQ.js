/**
 * Mock RabbitMQ for Testing
 * 
 * Simulates RabbitMQ message queue operations without actual broker.
 */

import { EventEmitter } from 'events';

class MockChannel extends EventEmitter {
  constructor() {
    super();
    this.queues = new Map();
    this.exchanges = new Map();
    this.prefetchCount = 1;
    this.consumers = new Map();
  }

  async assertQueue(queue, options = {}) {
    if (!this.queues.has(queue)) {
      this.queues.set(queue, {
        name: queue,
        options,
        messages: [],
        consumers: [],
      });
    }
    return { queue };
  }

  async assertExchange(exchange, type, options = {}) {
    if (!this.exchanges.has(exchange)) {
      this.exchanges.set(exchange, {
        name: exchange,
        type,
        options,
      });
    }
    return { exchange };
  }

  async bindQueue(queue, exchange, routingKey) {
    const queueData = this.queues.get(queue);
    if (queueData) {
      queueData.bindings = queueData.bindings || [];
      queueData.bindings.push({ exchange, routingKey });
    }
  }

  async publish(exchange, routingKey, content, options = {}) {
    const message = {
      content,
      fields: {
        exchange,
        routingKey,
        deliveryTag: Date.now(),
      },
      properties: options,
    };

    // Find queues bound to this exchange
    for (const [queueName, queueData] of this.queues) {
      if (queueData.bindings) {
        const binding = queueData.bindings.find(
          b => b.exchange === exchange && b.routingKey === routingKey
        );
        if (binding) {
          queueData.messages.push(message);
          this.emit('message', queueName, message);
        }
      }
    }

    return true;
  }

  async sendToQueue(queue, content, options = {}) {
    const queueData = this.queues.get(queue);
    if (!queueData) {
      throw new Error(`Queue ${queue} not found`);
    }

    const message = {
      content,
      fields: {
        deliveryTag: Date.now(),
      },
      properties: options,
    };

    queueData.messages.push(message);
    this.emit('message', queue, message);

    // Trigger consumer if exists
    if (queueData.consumers.length > 0) {
      const consumer = queueData.consumers[0];
      setImmediate(() => consumer.callback(message));
    }

    return true;
  }

  async consume(queue, callback, options = {}) {
    const queueData = this.queues.get(queue);
    if (!queueData) {
      throw new Error(`Queue ${queue} not found`);
    }

    const consumerTag = `consumer_${Date.now()}`;
    const consumer = { consumerTag, callback, options };
    
    queueData.consumers.push(consumer);
    this.consumers.set(consumerTag, { queue, callback });

    // Process existing messages
    while (queueData.messages.length > 0) {
      const message = queueData.messages.shift();
      setImmediate(() => callback(message));
    }

    return { consumerTag };
  }

  async ack(message) {
    // Mock acknowledgment
    return true;
  }

  async nack(message, allUpTo = false, requeue = true) {
    // Mock negative acknowledgment
    if (requeue) {
      // Re-add message to queue
      for (const [queueName, queueData] of this.queues) {
        if (queueData.messages.some(m => m.fields.deliveryTag === message.fields.deliveryTag)) {
          queueData.messages.push(message);
          break;
        }
      }
    }
    return true;
  }

  async prefetch(count) {
    this.prefetchCount = count;
  }

  async close() {
    this.queues.clear();
    this.exchanges.clear();
    this.consumers.clear();
    this.removeAllListeners();
  }

  // Helper methods for testing
  getQueueMessages(queue) {
    const queueData = this.queues.get(queue);
    return queueData ? queueData.messages : [];
  }

  getQueueMessageCount(queue) {
    const queueData = this.queues.get(queue);
    return queueData ? queueData.messages.length : 0;
  }

  clearQueue(queue) {
    const queueData = this.queues.get(queue);
    if (queueData) {
      queueData.messages = [];
    }
  }
}

class MockConnection extends EventEmitter {
  constructor() {
    super();
    this.channels = [];
  }

  async createChannel() {
    const channel = new MockChannel();
    this.channels.push(channel);
    return channel;
  }

  async close() {
    for (const channel of this.channels) {
      await channel.close();
    }
    this.channels = [];
    this.removeAllListeners();
  }
}

/**
 * Create mock RabbitMQ connection
 */
export async function createMockRabbitMQ() {
  return new MockConnection();
}

/**
 * Mock amqplib connect function
 */
export async function connect(url) {
  return new MockConnection();
}

export default {
  connect,
  createMockRabbitMQ,
  MockConnection,
  MockChannel,
};

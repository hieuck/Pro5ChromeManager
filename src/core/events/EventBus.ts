import { EventEmitter } from 'events';

// Define EventBus interface locally to avoid circular dependency
interface EventBus {
  subscribe(eventType: string, handler: (payload: any) => void): void;
  publish(eventType: string, payload: any): void;
  unsubscribe(eventType: string, handler: (payload: any) => void): void;
}

// Domain event base class
export abstract class DomainEvent {
  protected constructor(
    public readonly eventType: string,
    public readonly aggregateId: string,
    public readonly timestamp: Date = new Date()
  ) {}
}

// Specific domain events
export class ProfileCreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly profileName: string,
    public readonly fingerprint: any
  ) {
    super('ProfileCreated', aggregateId);
  }
}

export class ProfileUpdatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly changes: Record<string, any>
  ) {
    super('ProfileUpdated', aggregateId);
  }
}

export class ProfileDeletedEvent extends DomainEvent {
  constructor(aggregateId: string) {
    super('ProfileDeleted', aggregateId);
  }
}

export class InstanceStartedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly pid: number,
    public readonly port: number
  ) {
    super('InstanceStarted', aggregateId);
  }
}

export class InstanceStoppedEvent extends DomainEvent {
  constructor(aggregateId: string) {
    super('InstanceStopped', aggregateId);
  }
}

// Event bus implementation
export class EventBusImpl implements EventBus {
  private emitter = new EventEmitter();
  private handlers = new Map<string, Set<(payload: any) => void>>();

  subscribe(eventType: string, handler: (payload: any) => void): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    
    // Bind to emitter
    this.emitter.on(eventType, handler);
  }

  publish(eventType: string, payload: any): void {
    // Emit through EventEmitter for synchronous delivery
    this.emitter.emit(eventType, payload);
    
    // Also support async handlers
    setImmediate(() => {
      const asyncHandlers = this.handlers.get(`${eventType}:async`);
      if (asyncHandlers) {
        asyncHandlers.forEach(handler => {
          try {
            handler(payload);
          } catch (error) {
            console.error(`Error in async event handler for ${eventType}:`, error);
          }
        });
      }
    });
  }

  unsubscribe(eventType: string, handler: (payload: any) => void): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
    this.emitter.off(eventType, handler);
  }

  // Subscribe to async events
  subscribeAsync(eventType: string, handler: (payload: any) => void): void {
    const asyncEventType = `${eventType}:async`;
    if (!this.handlers.has(asyncEventType)) {
      this.handlers.set(asyncEventType, new Set());
    }
    this.handlers.get(asyncEventType)!.add(handler);
  }

  // Clear all handlers (useful for testing)
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
    this.handlers.clear();
  }
}

// Event publisher helper
export class EventPublisher {
  constructor(private readonly eventBus: EventBus) {}

  publish(event: DomainEvent): void {
    this.eventBus.publish(event.eventType, {
      aggregateId: event.aggregateId,
      timestamp: event.timestamp,
      payload: event
    });
  }
}

// Decorator for automatic event publishing
export function PublishEvents(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;
  
  descriptor.value = function(...args: any[]) {
    const result = method.apply(this, args);
    
    // If the method returns a DomainEvent, publish it
    if (result instanceof DomainEvent) {
      const eventBus = (this as any).eventBus;
      if (eventBus) {
        eventBus.publish(result.eventType, {
          aggregateId: result.aggregateId,
          timestamp: result.timestamp,
          payload: result
        });
      }
    }
    
    return result;
  };
  
  return descriptor;
}
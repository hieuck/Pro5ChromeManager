import { EventEmitter } from 'events';

// Core types
export interface ServiceIdentifier<T = any> {
  name: string;
  type: symbol;
}

export type Factory<T> = () => T | Promise<T>;

// Container implementation
export class DIContainer {
  private services = new Map<symbol, Factory<any>>();
  private instances = new Map<symbol, any>();
  private singletons = new Set<symbol>();

  register<T>(identifier: ServiceIdentifier<T>, factory: Factory<T>, singleton = true): void {
    this.services.set(identifier.type, factory);
    if (singleton) {
      this.singletons.add(identifier.type);
    }
  }

  async resolve<T>(identifier: ServiceIdentifier<T>): Promise<T> {
    const factory = this.services.get(identifier.type);
    if (!factory) {
      throw new Error(`Service ${identifier.name} not registered`);
    }

    // Return cached instance for singletons
    if (this.singletons.has(identifier.type) && this.instances.has(identifier.type)) {
      return this.instances.get(identifier.type);
    }

    const instance = await factory();
    
    // Cache singleton instances
    if (this.singletons.has(identifier.type)) {
      this.instances.set(identifier.type, instance);
    }

    return instance;
  }

  // Helper to create service identifiers
  static createIdentifier<T>(name: string): ServiceIdentifier<T> {
    return {
      name,
      type: Symbol(name)
    };
  }

  // Clear cached instances (useful for testing)
  clearCache(): void {
    this.instances.clear();
  }
}

// Global container instance
export const container = new DIContainer();

// Common service identifiers
export const LoggerService = DIContainer.createIdentifier<Logger>('Logger');
export const ConfigService = DIContainer.createIdentifier<ConfigManager>('ConfigManager');
export const EventBusService = DIContainer.createIdentifier<EventBus>('EventBus');
export const ProfileRepositoryService = DIContainer.createIdentifier<ProfileRepository>('ProfileRepository');

// Base interfaces
export interface Logger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, error?: Error, meta?: Record<string, any>): void;
}

export interface ConfigManager {
  load(): Promise<void>;
  get<T>(key: string): T;
  set<T>(key: string, value: T): void;
}

export interface EventBus {
  subscribe(eventType: string, handler: (payload: any) => void): void;
  publish(eventType: string, payload: any): void;
  unsubscribe(eventType: string, handler: (payload: any) => void): void;
}

export interface Repository<T> {
  save(entity: T): Promise<void>;
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  delete(id: string): Promise<void>;
}

export interface ProfileRepository extends Repository<any> {
  findByName(name: string): Promise<any[]>;
  findByGroup(group: string): Promise<any[]>;
}
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DIContainer } from '../core/di/Container';
import { WinstonLogger } from '../core/logging/WinstonLogger';
import { ConfigManagerImpl } from '../core/config/ConfigManager';
import { EventBusImpl } from '../core/events/EventBus';
import { FileSystemProfileRepository } from '../infrastructure/repositories/FileSystemProfileRepository';
import { Profile, ProfileId, ProfileName, Fingerprint } from '../domain/entities/Profile';

describe('Architecture Components Integration', () => {
  let container: DIContainer;
  
  beforeEach(() => {
    container = new DIContainer();
  });

  afterEach(() => {
    container.clearCache();
  });

  describe('Dependency Injection Container', () => {
    it('should register and resolve services', () => {
      const LoggerService = DIContainer.createIdentifier<WinstonLogger>('Logger');
      container.register(LoggerService, () => new WinstonLogger(), true);
      
      const logger = container.resolve(LoggerService);
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should provide singleton instances', async () => {
      const LoggerService = DIContainer.createIdentifier<WinstonLogger>('Logger');
      container.register(LoggerService, () => new WinstonLogger(), true);
      
      const logger1 = await container.resolve(LoggerService);
      const logger2 = await container.resolve(LoggerService);
      
      expect(logger1).toBe(logger2);
    });
  });

  describe('Domain Entities', () => {
    it('should create profile with valid data', () => {
      const id = new ProfileId('test-id');
      const name = new ProfileName('Test Profile');
      const fingerprint = new Fingerprint(
        'test-agent',
        0.5,
        'test-renderer',
        8,
        { width: 1920, height: 1080 },
        'UTC',
        ['en-US'],
        'Win32'
      );
      
      const profile = Profile.create(id, name, fingerprint);
      
      expect(profile.id).toBe(id);
      expect(profile.name).toBe(name);
      expect(profile.fingerprint).toBe(fingerprint);
    });

    it('should prevent invalid profile names', () => {
      expect(() => new ProfileName('')).toThrow();
      expect(() => new ProfileName('a'.repeat(101))).toThrow();
    });

    it('should handle profile updates', () => {
      const id = new ProfileId('test-id');
      const name = new ProfileName('Original Name');
      const fingerprint = new Fingerprint('test-agent', 0.5, 'test-renderer', 8, { width: 1920, height: 1080 }, 'UTC', ['en-US'], 'Win32');
      
      const profile = Profile.create(id, name, fingerprint);
      const newName = new ProfileName('Updated Name');
      
      profile.updateName(newName);
      
      expect(profile.name).toBe(newName);
    });
  });

  describe('Event System', () => {
    it('should publish and subscribe to events', () => {
      const eventBus = new EventBusImpl();
      let eventReceived = false;
      let eventData: any;
      
      eventBus.subscribe('test-event', (data) => {
        eventReceived = true;
        eventData = data;
      });
      
      const testPayload = { message: 'Hello World' };
      eventBus.publish('test-event', testPayload);
      
      expect(eventReceived).toBe(true);
      expect(eventData).toEqual(testPayload);
    });
  });

  describe('Repository Pattern', () => {
    it('should handle profile persistence operations', async () => {
      // This would test the file system repository, but we'll skip actual file operations in unit tests
      const repository = new FileSystemProfileRepository('./test-data/profiles');
      
      expect(repository).toBeDefined();
      expect(typeof repository.save).toBe('function');
      expect(typeof repository.findById).toBe('function');
      expect(typeof repository.findAll).toBe('function');
    });
  });

  describe('Configuration Management', () => {
    it('should load and provide configuration', async () => {
      const configManager = new ConfigManagerImpl('./test-data/config.json');
      
      // Mock the file system operations for testing
      const originalAccess = require('fs/promises').access;
      const originalMkdir = require('fs/promises').mkdir;
      const originalReadFile = require('fs/promises').readFile;
      
      // Mock implementations
      require('fs/promises').access = () => Promise.reject(new Error('File not found'));
      require('fs/promises').mkdir = () => Promise.resolve();
      require('fs/promises').readFile = () => Promise.resolve(JSON.stringify({}));
      
      try {
        await configManager.load();
        
        // Test default values
        expect(() => configManager.get('server.host')).not.toThrow();
        expect(() => configManager.get('server.port')).not.toThrow();
      } finally {
        // Restore original functions
        require('fs/promises').access = originalAccess;
        require('fs/promises').mkdir = originalMkdir;
        require('fs/promises').readFile = originalReadFile;
      }
    });
  });
});
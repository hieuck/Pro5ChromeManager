import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupContainer, getProfileApplicationService } from '../../core/di/setup';
import { container, LoggerService, EventBusService } from '../../core/di/Container';
import { EventBusImpl } from '../../core/events/EventBus';

describe('Architecture Integration Tests', () => {
  beforeEach(async () => {
    // Setup fresh container for each test
    await setupContainer();
  });

  afterEach(() => {
    // Clean up container
    container.clearCache();
    const eventBus = container.resolve(EventBusService) as EventBusImpl;
    eventBus.removeAllListeners();
  });

  describe('Dependency Injection', () => {
    it('should resolve core services', async () => {
      const logger = await container.resolve(LoggerService);
      const eventBus = await container.resolve(EventBusService);
      
      expect(logger).toBeDefined();
      expect(eventBus).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof eventBus.subscribe).toBe('function');
    });

    it('should provide singleton instances', async () => {
      const logger1 = await container.resolve(LoggerService);
      const logger2 = await container.resolve(LoggerService);
      
      expect(logger1).toBe(logger2);
    });
  });

  describe('Profile Application Service', () => {
    it('should create profile successfully', async () => {
      const service = await getProfileApplicationService();
      
      const response = await service.createProfile({
        name: 'Test Profile',
        groupId: 'test-group'
      });
      
      expect(response.success).toBe(true);
      expect(response.profileId).toBeDefined();
      expect(response.message).toBeUndefined();
    });

    it('should get created profile', async () => {
      const service = await getProfileApplicationService();
      
      // Create a profile first
      const createResponse = await service.createProfile({
        name: 'Test Profile for Get'
      });
      
      expect(createResponse.success).toBe(true);
      const profileId = createResponse.profileId!;
      
      // Get the profile
      const getResponse = await service.getProfile(profileId);
      
      expect(getResponse.success).toBe(true);
      expect(getResponse.profile).toBeDefined();
      expect(getResponse.profile!.id).toBe(profileId);
      expect(getResponse.profile!.name).toBe('Test Profile for Get');
    });

    it('should list profiles', async () => {
      const service = await getProfileApplicationService();
      
      // Create multiple profiles
      await service.createProfile({ name: 'Profile 1' });
      await service.createProfile({ name: 'Profile 2' });
      await service.createProfile({ name: 'Profile 3' });
      
      const response = await service.listProfiles();
      
      expect(response.success).toBe(true);
      expect(response.profiles.length).toBeGreaterThanOrEqual(3);
      expect(response.totalCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle profile not found', async () => {
      const service = await getProfileApplicationService();
      
      const response = await service.getProfile('non-existent-id');
      
      expect(response.success).toBe(false);
      expect(response.message).toContain('not found');
    });

    it('should update profile name', async () => {
      const service = await getProfileApplicationService();
      
      // Create profile
      const createResponse = await service.createProfile({ name: 'Original Name' });
      const profileId = createResponse.profileId!;
      
      // Update name
      const updateResponse = await service.updateProfileName(profileId, 'New Name');
      expect(updateResponse.success).toBe(true);
      
      // Verify update
      const getResponse = await service.getProfile(profileId);
      expect(getResponse.success).toBe(true);
      expect(getResponse.profile!.name).toBe('New Name');
    });

    it('should delete profile', async () => {
      const service = await getProfileApplicationService();
      
      // Create profile
      const createResponse = await service.createProfile({ name: 'To Be Deleted' });
      const profileId = createResponse.profileId!;
      
      // Delete profile
      const deleteResponse = await service.deleteProfile(profileId);
      expect(deleteResponse.success).toBe(true);
      
      // Verify deletion
      const getResponse = await service.getProfile(profileId);
      expect(getResponse.success).toBe(false);
      expect(getResponse.message).toContain('not found');
    });
  });

  describe('Event System', () => {
    it('should publish and receive events', async () => {
      const eventBus = await container.resolve(EventBusService);
      let eventReceived = false;
      let eventData: any;
      
      // Subscribe to event
      eventBus.subscribe('test-event', (data) => {
        eventReceived = true;
        eventData = data;
      });
      
      // Publish event
      const testPayload = { message: 'Hello World' };
      eventBus.publish('test-event', testPayload);
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(eventReceived).toBe(true);
      expect(eventData).toEqual(testPayload);
    });

    it('should handle profile creation events', async () => {
      const service = await getProfileApplicationService();
      const eventBus = await container.resolve(EventBusService);
      let profileCreatedEvent: any;
      
      eventBus.subscribe('ProfileCreated', (data) => {
        profileCreatedEvent = data;
      });
      
      await service.createProfile({
        name: 'Event Test Profile',
        groupId: 'event-test-group'
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(profileCreatedEvent).toBeDefined();
      expect(profileCreatedEvent.payload.profileName).toBe('Event Test Profile');
      expect(profileCreatedEvent.payload.groupId).toBe('event-test-group');
    });
  });

  describe('Configuration', () => {
    it('should load configuration', async () => {
      const configManager = await container.resolve(ConfigService);
      
      // Test default configuration values
      expect(configManager.get('server.host')).toBe('127.0.0.1');
      expect(configManager.get('server.port')).toBe(3210);
      expect(configManager.get('features.fingerprinting')).toBe(true);
    });

    it('should allow configuration updates', async () => {
      const configManager = await container.resolve(ConfigService);
      
      configManager.set('server.port', 4000);
      expect(configManager.get('server.port')).toBe(4000);
    });
  });
});
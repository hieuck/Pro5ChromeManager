import { container, LoggerService, ConfigService, EventBusService, ProfileRepositoryService } from '../core/di/Container';
import { WinstonLogger } from '../core/logging/WinstonLogger';
import { ConfigManagerImpl } from '../core/config/ConfigManager';
import { EventBusImpl } from '../core/events/EventBus';
import { FileSystemProfileRepository } from '../infrastructure/repositories/FileSystemProfileRepository';
import path from 'path';

// Setup dependency injection container
export async function setupContainer(): Promise<void> {
  // Register core services
  container.register(LoggerService, () => new WinstonLogger(), true);
  container.register(ConfigService, () => new ConfigManagerImpl('./data/config.json'), true);
  container.register(EventBusService, () => new EventBusImpl(), true);
  
  // Load config first
  const configManager = await container.resolve(ConfigService);
  await configManager.load();
  
  // Register infrastructure services
  const profilesDir = configManager.get<string>('paths.profilesDir');
  container.register(
    ProfileRepositoryService, 
    () => new FileSystemProfileRepository(profilesDir), 
    true
  );
}

// Helper to get application service with dependencies
export async function getProfileApplicationService() {
  const { ProfileApplicationService } = await import('../application/services/ProfileApplicationService');
  return new ProfileApplicationService();
}

// Initialize container on module load
setupContainer().catch(error => {
  console.error('Failed to setup DI container:', error);
});
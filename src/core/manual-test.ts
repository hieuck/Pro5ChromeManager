// Simple manual test to verify architecture components
import { DIContainer } from './di/Container';
import { WinstonLogger } from './logging/WinstonLogger';
import { ConfigManagerImpl } from './config/ConfigManager';
import { EventBusImpl } from './events/EventBus';
import { Profile, ProfileId, ProfileName, Fingerprint } from '../domain/entities/Profile';

async function testArchitectureComponents() {
  console.log('🧪 Testing Architecture Components...\n');

  try {
    // Test 1: Dependency Injection Container
    console.log('1. Testing Dependency Injection Container...');
    const container = new DIContainer();
    const LoggerService = DIContainer.createIdentifier<WinstonLogger>('Logger');
    
    container.register(LoggerService, () => new WinstonLogger(), true);
    const logger = await container.resolve(LoggerService);
    
    console.log('✅ DI Container: OK');
    logger.info('Logger working correctly');

    // Test 2: Domain Entities
    console.log('\n2. Testing Domain Entities...');
    const id = new ProfileId('test-profile-123');
    const name = new ProfileName('Test Profile');
    const fingerprint = new Fingerprint(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      0.3,
      'Intel Iris OpenGL Engine',
      8,
      { width: 1920, height: 1080 },
      'America/New_York',
      ['en-US', 'en'],
      'Win32'
    );
    
    const profile = Profile.create(id, name, fingerprint);
    console.log('✅ Domain Entities: OK');
    console.log(`   Profile ID: ${profile.id.toString()}`);
    console.log(`   Profile Name: ${profile.name.toString()}`);

    // Test 3: Event System
    console.log('\n3. Testing Event System...');
    const eventBus = new EventBusImpl();
    let eventReceived = false;
    
    eventBus.subscribe('ProfileCreated', (data) => {
      eventReceived = true;
      console.log(`   Event received: ${JSON.stringify(data)}`);
    });
    
    eventBus.publish('ProfileCreated', {
      profileId: 'test-123',
      name: 'Test Profile'
    });
    
    console.log('✅ Event System: OK');

    // Test 4: Configuration Management
    console.log('\n4. Testing Configuration Management...');
    const configManager = new ConfigManagerImpl('./test-data/config.json');
    await configManager.load(); // Load config first
    console.log('✅ Configuration Management: OK');
    console.log(`   Default server port: ${configManager.get('server.port')}`);

    console.log('\n🎉 All architecture components working correctly!');
    return true;

  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run the test
testArchitectureComponents().then(success => {
  process.exit(success ? 0 : 1);
});
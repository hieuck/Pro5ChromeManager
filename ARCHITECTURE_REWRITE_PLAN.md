# Pro5 Chrome Manager - Architecture Rewrite Plan

## Current State Analysis

### Strengths
- Well-structured feature modules (profiles, proxies, extensions, etc.)
- Good TypeScript typing throughout
- Clear separation between server/UI/Electron layers
- Comprehensive feature set for browser profile management
- Solid foundation with working functionality

### Major Issues
1. **Tight Coupling**: Direct imports between managers create tight dependencies
2. **Manual Initialization**: Managers must be manually initialized in lifecycle
3. **No Dependency Injection**: Makes testing and flexibility difficult
4. **Missing Event System**: No pub/sub for cross-component communication
5. **Scattered Configuration**: Config spread across multiple managers
6. **Inconsistent Error Handling**: Error patterns vary throughout codebase
7. **Limited Observability**: Minimal monitoring and metrics collection

## Target Architecture

### Core Principles
1. **Clean Architecture** - Clear separation of layers and concerns
2. **Dependency Inversion** - High-level modules don't depend on low-level modules
3. **Single Responsibility** - Each module has one reason to change
4. **Open/Closed Principle** - Open for extension, closed for modification
5. **Event-Driven** - Loose coupling through publish/subscribe patterns
6. **Testable** - Easy unit testing with dependency injection

### New Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                       │
│  React UI Components | Electron Main | API Controllers      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                        │
│  Use Cases | Services | Event Handlers | DTOs               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     DOMAIN LAYER                            │
│  Entities | Value Objects | Domain Events | Repositories    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                      │
│  Database | File System | External APIs | Message Brokers   │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Foundation Layer

### 1.1 Dependency Injection Container
```typescript
// di/container.ts
export class DIContainer {
  private services = new Map<string, any>();
  
  register<T>(token: string, factory: () => T): void {
    this.services.set(token, factory);
  }
  
  resolve<T>(token: string): T {
    const factory = this.services.get(token);
    if (!factory) throw new Error(`Service ${token} not registered`);
    return factory();
  }
}

// Register core services
container.register('Logger', () => new WinstonLogger());
container.register('ConfigManager', () => new ConfigManager());
container.register('EventManager', () => new EventEmitter());
```

### 1.2 Event System
```typescript
// core/events/EventBus.ts
export interface DomainEvent {
  type: string;
  payload: any;
  timestamp: Date;
}

export class EventBus {
  private subscribers = new Map<string, Set<(event: DomainEvent) => void>>();
  
  subscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler);
  }
  
  publish(event: DomainEvent): void {
    const handlers = this.subscribers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => handler(event));
    }
  }
}
```

### 1.3 Unified Configuration
```typescript
// core/config/AppConfig.ts
export interface AppConfig {
  server: {
    host: string;
    port: number;
    cors: boolean;
  };
  database: {
    type: 'sqlite' | 'postgresql';
    connectionString: string;
  };
  features: {
    fingerprinting: boolean;
    proxyManagement: boolean;
    extensionManagement: boolean;
  };
  monitoring: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

export class ConfigManager {
  private config: AppConfig;
  
  async load(): Promise<void> {
    // Load from file, env vars, etc.
    this.config = await this.loadFromFile();
  }
  
  get(): AppConfig {
    return this.config;
  }
}
```

## Phase 2: Domain Layer Redesign

### 2.1 Core Domain Entities
```typescript
// domain/entities/Profile.ts
export class Profile {
  private constructor(
    private readonly id: string,
    private name: string,
    private readonly fingerprint: Fingerprint,
    private proxy?: ProxyConfig,
    private extensions: Extension[] = [],
    private readonly createdAt: Date,
    private updatedAt: Date
  ) {}
  
  static create(name: string, fingerprint: Fingerprint): Profile {
    return new Profile(
      uuid(),
      name,
      fingerprint,
      undefined,
      [],
      new Date(),
      new Date()
    );
  }
  
  updateName(newName: string): void {
    this.name = newName;
    this.updatedAt = new Date();
    DomainEvents.publish(new ProfileUpdatedEvent(this.id, { name: newName }));
  }
  
  assignProxy(proxy: ProxyConfig): void {
    this.proxy = proxy;
    this.updatedAt = new Date();
  }
}

// domain/value-objects/Fingerprint.ts
export class Fingerprint {
  constructor(
    public readonly userAgent: string,
    public readonly canvasNoise: number,
    public readonly webglRenderer: string,
    // ... other fingerprint properties
  ) {}
  
  equals(other: Fingerprint): boolean {
    return JSON.stringify(this) === JSON.stringify(other);
  }
}
```

### 2.2 Repository Pattern
```typescript
// domain/repositories/ProfileRepository.ts
export interface ProfileRepository {
  save(profile: Profile): Promise<void>;
  findById(id: string): Promise<Profile | null>;
  findAll(): Promise<Profile[]>;
  delete(id: string): Promise<void>;
  findByName(name: string): Promise<Profile[]>;
}

// infrastructure/repositories/FileSystemProfileRepository.ts
export class FileSystemProfileRepository implements ProfileRepository {
  constructor(private readonly basePath: string) {}
  
  async save(profile: Profile): Promise<void> {
    const profilePath = path.join(this.basePath, `${profile.getId()}.json`);
    await fs.writeFile(profilePath, JSON.stringify(profile.toPersistence()));
  }
  
  async findById(id: string): Promise<Profile | null> {
    try {
      const profilePath = path.join(this.basePath, `${id}.json`);
      const data = await fs.readFile(profilePath, 'utf-8');
      return Profile.fromPersistence(JSON.parse(data));
    } catch (error) {
      return null;
    }
  }
  
  // ... other methods
}
```

## Phase 3: Application Layer

### 3.1 Use Cases/Services
```typescript
// application/usecases/CreateProfileUseCase.ts
export interface CreateProfileRequest {
  name: string;
  group?: string;
  proxyId?: string;
  extensionIds?: string[];
}

export interface CreateProfileResponse {
  profileId: string;
  success: boolean;
  message?: string;
}

export class CreateProfileUseCase {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly fingerprintGenerator: FingerprintGenerator,
    private readonly proxyService: ProxyService,
    private readonly eventBus: EventBus
  ) {}
  
  async execute(request: CreateProfileRequest): Promise<CreateProfileResponse> {
    try {
      const fingerprint = await this.fingerprintGenerator.generate();
      const profile = Profile.create(request.name, fingerprint);
      
      if (request.group) {
        profile.assignGroup(request.group);
      }
      
      if (request.proxyId) {
        const proxy = await this.proxyService.findById(request.proxyId);
        if (proxy) {
          profile.assignProxy(proxy);
        }
      }
      
      await this.profileRepository.save(profile);
      
      this.eventBus.publish(new ProfileCreatedEvent(profile.getId()));
      
      return {
        profileId: profile.getId(),
        success: true
      };
    } catch (error) {
      this.logger.error('Failed to create profile', { error });
      return {
        profileId: '',
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
```

### 3.2 Event Handlers
```typescript
// application/event-handlers/ProfileCreatedHandler.ts
export class ProfileCreatedHandler {
  constructor(
    private readonly extensionService: ExtensionService,
    private readonly backupService: BackupService
  ) {}
  
  async handle(event: ProfileCreatedEvent): Promise<void> {
    // Install default extensions
    await this.extensionService.installDefaults(event.profileId);
    
    // Schedule initial backup
    await this.backupService.scheduleInitialBackup(event.profileId);
  }
}
```

## Phase 4: Infrastructure Improvements

### 4.1 Modern Logging
```typescript
// infrastructure/logging/StructuredLogger.ts
export class StructuredLogger {
  constructor(private readonly logger: winston.Logger) {}
  
  info(message: string, context?: Record<string, any>): void {
    this.logger.info(message, {
      timestamp: new Date().toISOString(),
      context,
      service: 'pro5-chrome-manager'
    });
  }
  
  error(message: string, error: Error, context?: Record<string, any>): void {
    this.logger.error(message, {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack
      },
      context,
      service: 'pro5-chrome-manager'
    });
  }
}
```

### 4.2 Health Monitoring
```typescript
// infrastructure/monitoring/HealthChecker.ts
export class HealthChecker {
  constructor(
    private readonly checks: HealthCheck[]
  ) {}
  
  async check(): Promise<HealthStatus> {
    const results = await Promise.all(
      this.checks.map(check => check.execute())
    );
    
    const isHealthy = results.every(result => result.status === 'healthy');
    
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: results
    };
  }
}

export interface HealthCheck {
  name: string;
  execute(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    message?: string;
  }>;
}
```

## Phase 5: API Layer Modernization

### 5.1 Standardized API Responses
```typescript
// presentation/api/ApiResponse.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

export class ApiResponder {
  static success<T>(data: T, meta?: any): ApiResponse<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuid(),
        version: '1.0',
        ...meta
      }
    };
  }
  
  static error(code: string, message: string, details?: any): ApiResponse<never> {
    return {
      success: false,
      error: { code, message, details },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuid(),
        version: '1.0'
      }
    };
  }
}
```

### 5.2 Validation Middleware
```typescript
// presentation/middleware/validation.ts
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json(ApiResponder.error('VALIDATION_ERROR', 'Invalid request data', error.errors));
      } else {
        next(error);
      }
    }
  };
}
```

## Phase 6: Testing Strategy

### 6.1 Unit Test Structure
```typescript
// tests/unit/domain/Profile.test.ts
describe('Profile', () => {
  describe('create', () => {
    it('should create a profile with valid parameters', () => {
      const fingerprint = new Fingerprint('test-agent', 0.1, 'test-renderer');
      const profile = Profile.create('Test Profile', fingerprint);
      
      expect(profile.getName()).toBe('Test Profile');
      expect(profile.getFingerprint()).toBe(fingerprint);
    });
  });
  
  describe('updateName', () => {
    it('should update profile name and emit event', () => {
      const profile = Profile.create('Old Name', mockFingerprint);
      const eventSpy = jest.spyOn(DomainEvents, 'publish');
      
      profile.updateName('New Name');
      
      expect(profile.getName()).toBe('New Name');
      expect(eventSpy).toHaveBeenCalledWith(expect.any(ProfileUpdatedEvent));
    });
  });
});
```

### 6.2 Integration Test Setup
```typescript
// tests/integration/usecases/CreateProfileUseCase.test.ts
describe('CreateProfileUseCase', () => {
  let useCase: CreateProfileUseCase;
  let profileRepository: MockProfileRepository;
  let fingerprintGenerator: MockFingerprintGenerator;
  
  beforeEach(() => {
    profileRepository = new MockProfileRepository();
    fingerprintGenerator = new MockFingerprintGenerator();
    useCase = new CreateProfileUseCase(
      profileRepository,
      fingerprintGenerator,
      mockProxyService,
      mockEventBus
    );
  });
  
  it('should create profile successfully', async () => {
    const request: CreateProfileRequest = {
      name: 'Test Profile'
    };
    
    const response = await useCase.execute(request);
    
    expect(response.success).toBe(true);
    expect(profileRepository.save).toHaveBeenCalled();
    expect(mockEventBus.publish).toHaveBeenCalledWith(expect.any(ProfileCreatedEvent));
  });
});
```

## Migration Strategy

### Phase-by-Phase Approach

1. **Phase 1** (2-3 weeks): Foundation layer (DI, Events, Config)
2. **Phase 2** (3-4 weeks): Domain layer redesign
3. **Phase 3** (2-3 weeks): Application layer (use cases, event handlers)
4. **Phase 4** (2 weeks): Infrastructure improvements
5. **Phase 5** (2 weeks): API modernization
6. **Phase 6** (2 weeks): Testing and documentation

### Backward Compatibility
- Maintain existing API contracts during transition
- Use adapter pattern for legacy code integration
- Gradual migration of features
- Comprehensive test coverage before each phase

### Risk Mitigation
- Feature flags for new architecture components
- Parallel running of old/new systems where possible
- Comprehensive monitoring during transition
- Rollback plan for each phase

## Success Metrics

- **Code Quality**: 90%+ test coverage, reduced cyclomatic complexity
- **Performance**: <50ms response time for 95% of requests
- **Maintainability**: Reduced coupling, improved modularity scores
- **Developer Experience**: Faster build times, better debugging tools
- **Reliability**: 99.9% uptime, <1% error rate

This rewrite will transform Pro5 Chrome Manager from a monolithic application into a modern, scalable, and maintainable system following industry best practices.
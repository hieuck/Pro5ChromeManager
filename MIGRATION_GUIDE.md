# Migration Guide: Legacy to New Architecture

## Overview
This guide explains how to gradually migrate existing Pro5 Chrome Manager code to the new clean architecture while maintaining functionality and minimizing disruption.

## Migration Strategy

### Phase 1: Foundation Integration
**Goal**: Integrate new architecture components alongside existing code

1. **Keep existing routes working** - Don't break current functionality
2. **Add new API endpoints** using the new architecture
3. **Run both systems in parallel** during transition

### Phase 2: Component Migration
**Goal**: Migrate individual components one by one

1. **Start with leaf components** (least dependencies)
2. **Migrate repositories** to new repository pattern
3. **Migrate services** to application services
4. **Migrate controllers** to new presentation layer

### Phase 3: Full Transition
**Goal**: Complete migration with proper testing

1. **Remove legacy code** once new components are verified
2. **Update documentation** and examples
3. **Comprehensive testing** of migrated functionality

## Step-by-Step Migration Process

### 1. Setting Up Parallel Systems

```typescript
// Keep existing server setup
import express from 'express';
import { app as legacyApp } from './legacy-server'; // existing code
import { setupNewRoutes } from './presentation/routes'; // new code

const app = express();

// Mount legacy routes under /legacy prefix
app.use('/api/legacy', legacyApp);

// Mount new routes
setupNewRoutes(app);

// Both systems run simultaneously
app.listen(3210, () => {
  console.log('Server running with both legacy and new APIs');
});
```

### 2. Migrating Profile Management

#### Current Legacy Approach:
```typescript
// src/server/features/profiles/router.ts (OLD)
router.post('/', async (req, res) => {
  const profile = await profileManager.createProfile(req.body);
  res.json(profile);
});
```

#### New Architecture Approach:
```typescript
// src/presentation/routes/profiles.ts (NEW)
import { ProfileController } from '../controllers/ProfileController';

router.post('/', ProfileController.createProfile);
```

### 3. Repository Migration

#### Before (Direct File Operations):
```typescript
// Old approach - mixed concerns
class ProfileManager {
  async saveProfile(profile: any) {
    const profilePath = path.join(this.profilesDir, `${profile.id}.json`);
    await fs.writeFile(profilePath, JSON.stringify(profile));
    // Business logic mixed with file operations
  }
}
```

#### After (Repository Pattern):
```typescript
// New approach - separated concerns
class FileSystemProfileRepository implements ProfileRepository {
  async save(profile: Profile): Promise<void> {
    const profilePath = path.join(this.profilesDir, `${profile.id.toString()}.json`);
    await fs.writeFile(profilePath, JSON.stringify(profile.toPersistence()));
  }
}

// Application service coordinates business logic
class ProfileApplicationService {
  async createProfile(request: CreateProfileRequest) {
    const profile = Profile.create(/* ... */);
    await this.repository.save(profile);
    this.eventBus.publish(new ProfileCreatedEvent(/* ... */));
  }
}
```

### 4. Dependency Injection Setup

#### Before (Manual Dependencies):
```typescript
// Tight coupling everywhere
class ProfileManager {
  constructor() {
    this.logger = new WinstonLogger();
    this.config = new ConfigManager();
  }
}
```

#### After (DI Container):
```typescript
// Loose coupling through container
const container = new DIContainer();
container.register(LoggerService, () => new WinstonLogger());
container.register(ConfigService, () => new ConfigManager());

class ProfileManager {
  constructor() {
    this.logger = container.resolve(LoggerService);
    this.config = container.resolve(ConfigService);
  }
}
```

## Migration Checklist

### ✅ Completed Items
- [x] Core architecture components implemented
- [x] Dependency injection container working
- [x] Event bus system functional
- [x] Domain entities created
- [x] Repository pattern implemented
- [x] Application services created
- [x] API controllers developed
- [x] Manual integration testing completed

### 🔄 In Progress
- [ ] Import path resolution in tests
- [ ] Route integration with existing server
- [ ] Legacy code identification and mapping

### 🔜 Next Steps
- [ ] Create adapter layer for legacy components
- [ ] Implement feature flag system for gradual rollout
- [ ] Write comprehensive migration tests
- [ ] Document breaking changes and migration path
- [ ] Create rollback procedure

## Best Practices During Migration

### 1. Maintain Backward Compatibility
- Keep existing API contracts unchanged initially
- Add new endpoints with different paths/names
- Use versioning for major breaking changes

### 2. Incremental Approach
- Migrate one component at a time
- Test thoroughly after each migration
- Keep working code in production between migrations

### 3. Monitoring and Rollback
- Implement comprehensive logging
- Add health checks for new components
- Prepare rollback plan for each migration step

### 4. Team Coordination
- Communicate migration schedule to team
- Update documentation continuously
- Provide clear migration guides for other developers

## Common Migration Patterns

### Adapter Pattern for Legacy Integration
```typescript
// Wrap legacy components in new interfaces
class LegacyProfileAdapter implements ProfileRepository {
  constructor(private legacyManager: any) {}
  
  async save(profile: Profile): Promise<void> {
    // Convert new domain entity to legacy format
    const legacyProfile = profile.toLegacyFormat();
    await this.legacyManager.saveProfile(legacyProfile);
  }
}
```

### Facade Pattern for Simplified Migration
```typescript
// Provide simplified interface during transition
class ProfileFacade {
  constructor(
    private newService: ProfileApplicationService,
    private legacyManager: any
  ) {}
  
  async createProfile(data: any) {
    // Route to appropriate implementation based on feature flags
    if (process.env.USE_NEW_ARCHITECTURE) {
      return this.newService.createProfile(data);
    }
    return this.legacyManager.createProfile(data);
  }
}
```

## Testing Strategy

### 1. Parallel Testing
- Test both old and new implementations side by side
- Verify identical behavior for same inputs
- Performance comparison between implementations

### 2. Gradual Rollout Testing
- Start with test environments only
- Gradually increase traffic to new implementation
- Monitor for regressions and performance issues

### 3. Contract Testing
- Ensure API contracts remain consistent
- Test integration points between components
- Validate data flow through the system

This migration approach ensures minimal disruption while providing a clear path to modern, maintainable architecture.
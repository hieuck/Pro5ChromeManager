import { Profile, ProfileId, ProfileName, Fingerprint } from '../../domain/entities/Profile';
import { ProfileRepository, EventBus } from '../../core/di/Container';
import { ProfileCreatedDomainEvent } from '../../domain/entities/Profile';
import { container, LoggerService, EventBusService, ProfileRepositoryService } from '../../core/di/Container';

// Request/Response DTOs
export interface CreateProfileRequest {
  name: string;
  groupId?: string;
  ownerId?: string;
  proxyId?: string;
  tags?: string[];
  extensionIds?: string[];
}

export interface CreateProfileResponse {
  success: boolean;
  profileId?: string;
  message?: string;
}

export interface GetProfileResponse {
  success: boolean;
  profile?: {
    id: string;
    name: string;
    groupId?: string;
    ownerId?: string;
    tags: string[];
    extensions: string[];
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    totalSessions: number;
  };
  message?: string;
}

export interface ListProfilesResponse {
  success: boolean;
  profiles: Array<{
    id: string;
    name: string;
    groupId?: string;
    ownerId?: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
  }>;
  totalCount: number;
  message?: string;
}

// Application Service
export class ProfileApplicationService {
  private logger: any;
  private eventBus: EventBus;
  private profileRepository: ProfileRepository;

  constructor() {
    // Dependencies will be injected
    this.initializeDependencies();
  }

  private async initializeDependencies(): Promise<void> {
    try {
      this.logger = await container.resolve(LoggerService);
      this.eventBus = await container.resolve(EventBusService);
      this.profileRepository = await container.resolve(ProfileRepositoryService);
    } catch (error) {
      // Fallback initialization - this should be handled better in production
      console.error('Failed to initialize ProfileApplicationService dependencies:', error);
    }
  }

  async createProfile(request: CreateProfileRequest): Promise<CreateProfileResponse> {
    try {
      // Validate input
      if (!request.name || request.name.trim().length === 0) {
        return {
          success: false,
          message: 'Profile name is required'
        };
      }

      // Generate profile ID
      const profileId = new ProfileId(this.generateId());
      const profileName = new ProfileName(request.name.trim());
      
      // Generate fingerprint (simplified - would use FingerprintGenerator service)
      const fingerprint = this.generateFingerprint();
      
      // Create profile entity
      const profile = Profile.create(profileId, profileName, fingerprint);
      
      // Apply additional properties
      if (request.groupId) {
        profile.assignGroup(request.groupId);
      }
      
      if (request.ownerId) {
        profile.assignOwner(request.ownerId);
      }
      
      if (request.tags && request.tags.length > 0) {
        request.tags.forEach(tag => profile.addTag(tag));
      }
      
      if (request.extensionIds && request.extensionIds.length > 0) {
        request.extensionIds.forEach(extId => profile.addExtension(extId));
      }

      // Save to repository
      await this.profileRepository.save(profile);

      // Publish domain event
      const event = new ProfileCreatedDomainEvent(
        profileId.toString(),
        profileName.toString(),
        fingerprint,
        request.groupId
      );
      
      this.eventBus.publish(event.eventType, {
        aggregateId: event.aggregateId,
        timestamp: event.timestamp,
        payload: event
      });

      this.logger?.info('Profile created successfully', {
        profileId: profileId.toString(),
        name: profileName.toString()
      });

      return {
        success: true,
        profileId: profileId.toString()
      };

    } catch (error) {
      this.logger?.error('Failed to create profile', error as Error, { 
        name: request.name,
        groupId: request.groupId
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create profile'
      };
    }
  }

  async getProfile(id: string): Promise<GetProfileResponse> {
    try {
      const profile = await this.profileRepository.findById(id);
      
      if (!profile) {
        return {
          success: false,
          message: `Profile not found: ${id}`
        };
      }

      return {
        success: true,
        profile: {
          id: profile.id.toString(),
          name: profile.name.toString(),
          groupId: profile.groupId,
          ownerId: profile.ownerId,
          tags: profile.tags,
          extensions: profile.extensions,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
          lastUsedAt: profile.lastUsedAt?.toISOString(),
          totalSessions: profile.totalSessions
        }
      };

    } catch (error) {
      this.logger?.error('Failed to get profile', error as Error, { profileId: id });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get profile'
      };
    }
  }

  async listProfiles(page: number = 1, limit: number = 50): Promise<ListProfilesResponse> {
    try {
      const allProfiles = await this.profileRepository.findAll();
      const totalCount = allProfiles.length;
      
      // Simple pagination
      const startIndex = (page - 1) * limit;
      const paginatedProfiles = allProfiles.slice(startIndex, startIndex + limit);
      
      const profiles = paginatedProfiles.map(profile => ({
        id: profile.id.toString(),
        name: profile.name.toString(),
        groupId: profile.groupId,
        ownerId: profile.ownerId,
        tags: profile.tags,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
        lastUsedAt: profile.lastUsedAt?.toISOString()
      }));

      return {
        success: true,
        profiles,
        totalCount
      };

    } catch (error) {
      this.logger?.error('Failed to list profiles', error as Error);

      return {
        success: false,
        profiles: [],
        totalCount: 0,
        message: error instanceof Error ? error.message : 'Failed to list profiles'
      };
    }
  }

  async updateProfileName(id: string, newName: string): Promise<{ success: boolean; message?: string }> {
    try {
      const profile = await this.profileRepository.findById(id);
      
      if (!profile) {
        return {
          success: false,
          message: `Profile not found: ${id}`
        };
      }

      const profileName = new ProfileName(newName.trim());
      profile.updateName(profileName);
      
      await this.profileRepository.save(profile);

      this.logger?.info('Profile name updated', {
        profileId: id,
        newName: newName.trim()
      });

      return { success: true };

    } catch (error) {
      this.logger?.error('Failed to update profile name', error as Error, { 
        profileId: id, 
        newName 
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update profile name'
      };
    }
  }

  async deleteProfile(id: string): Promise<{ success: boolean; message?: string }> {
    try {
      const exists = await this.profileRepository.exists(id);
      
      if (!exists) {
        return {
          success: false,
          message: `Profile not found: ${id}`
        };
      }

      await this.profileRepository.delete(id);

      this.logger?.info('Profile deleted', { profileId: id });

      return { success: true };

    } catch (error) {
      this.logger?.error('Failed to delete profile', error as Error, { profileId: id });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete profile'
      };
    }
  }

  async searchProfiles(query: {
    name?: string;
    groupId?: string;
    tags?: string[];
  }): Promise<ListProfilesResponse> {
    try {
      let profiles: Profile[] = [];

      if (query.name) {
        profiles = await this.profileRepository.findByName(query.name);
      } else if (query.groupId) {
        profiles = await this.profileRepository.findByGroup(query.groupId);
      } else if (query.tags && query.tags.length > 0) {
        profiles = await this.profileRepository.findByTags(query.tags);
      } else {
        profiles = await this.profileRepository.findAll();
      }

      const profileDTOs = profiles.map(profile => ({
        id: profile.id.toString(),
        name: profile.name.toString(),
        groupId: profile.groupId,
        ownerId: profile.ownerId,
        tags: profile.tags,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
        lastUsedAt: profile.lastUsedAt?.toISOString()
      }));

      return {
        success: true,
        profiles: profileDTOs,
        totalCount: profileDTOs.length
      };

    } catch (error) {
      this.logger?.error('Failed to search profiles', error as Error, { query });

      return {
        success: false,
        profiles: [],
        totalCount: 0,
        message: error instanceof Error ? error.message : 'Failed to search profiles'
      };
    }
  }

  // Private helper methods
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private generateFingerprint(): Fingerprint {
    // Simplified fingerprint generation - would be replaced with proper service
    return new Fingerprint(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Math.random(),
      'Intel Iris OpenGL Engine',
      8,
      { width: 1920, height: 1080 },
      'America/New_York',
      ['en-US', 'en'],
      'Win32'
    );
  }
}
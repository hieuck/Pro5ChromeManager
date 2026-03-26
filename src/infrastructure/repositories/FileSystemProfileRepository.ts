import fs from 'fs/promises';
import path from 'path';
import { Profile, ProfileId, ProfileName } from '../entities/Profile';
import { ProfileRepository } from '../../core/di/Container';
import { container, LoggerService } from '../../core/di/Container';

export class FileSystemProfileRepository implements ProfileRepository {
  private readonly profilesDir: string;
  private logger: any;

  constructor(profilesDir: string) {
    this.profilesDir = profilesDir;
    // Will be injected later
    setTimeout(async () => {
      this.logger = await container.resolve(LoggerService);
    }, 0);
  }

  async save(profile: Profile): Promise<void> {
    try {
      await fs.mkdir(this.profilesDir, { recursive: true });
      
      const profilePath = path.join(this.profilesDir, `${profile.id.toString()}.json`);
      const profileData = profile.toPersistence();
      
      await fs.writeFile(profilePath, JSON.stringify(profileData, null, 2));
      
      this.logger?.info('Profile saved', { 
        profileId: profile.id.toString(), 
        name: profile.name.toString() 
      });
    } catch (error) {
      this.logger?.error('Failed to save profile', error as Error, {
        profileId: profile.id.toString()
      });
      throw new Error(`Failed to save profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findById(id: string): Promise<Profile | null> {
    try {
      const profilePath = path.join(this.profilesDir, `${id}.json`);
      const exists = await fs.access(profilePath).then(() => true).catch(() => false);
      
      if (!exists) {
        return null;
      }

      const data = await fs.readFile(profilePath, 'utf-8');
      const profileData = JSON.parse(data);
      const profile = Profile.fromPersistence(profileData);
      
      this.logger?.debug('Profile loaded', { profileId: id });
      return profile;
    } catch (error) {
      this.logger?.error('Failed to load profile', error as Error, { profileId: id });
      throw new Error(`Failed to load profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findAll(): Promise<Profile[]> {
    try {
      await fs.mkdir(this.profilesDir, { recursive: true });
      
      const files = await fs.readdir(this.profilesDir);
      const profileFiles = files.filter(file => file.endsWith('.json'));
      
      const profiles: Profile[] = [];
      
      for (const file of profileFiles) {
        try {
          const filePath = path.join(this.profilesDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const profileData = JSON.parse(data);
          const profile = Profile.fromPersistence(profileData);
          profiles.push(profile);
        } catch (error) {
          this.logger?.warn('Failed to load profile file', error as Error, { file });
          // Continue with other files
        }
      }
      
      this.logger?.debug('All profiles loaded', { count: profiles.length });
      return profiles;
    } catch (error) {
      this.logger?.error('Failed to load profiles', error as Error);
      throw new Error(`Failed to load profiles: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const profilePath = path.join(this.profilesDir, `${id}.json`);
      const exists = await fs.access(profilePath).then(() => true).catch(() => false);
      
      if (!exists) {
        throw new Error(`Profile not found: ${id}`);
      }

      await fs.unlink(profilePath);
      
      // Also remove profile directory if it exists
      const profileDir = path.join(this.profilesDir, id);
      const dirExists = await fs.access(profileDir).then(() => true).catch(() => false);
      if (dirExists) {
        await fs.rm(profileDir, { recursive: true, force: true });
      }
      
      this.logger?.info('Profile deleted', { profileId: id });
    } catch (error) {
      this.logger?.error('Failed to delete profile', error as Error, { profileId: id });
      throw new Error(`Failed to delete profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findByName(name: string): Promise<Profile[]> {
    try {
      const allProfiles = await this.findAll();
      const matchingProfiles = allProfiles.filter(profile => 
        profile.name.toString().toLowerCase().includes(name.toLowerCase())
      );
      
      this.logger?.debug('Profiles found by name', { 
        searchName: name, 
        count: matchingProfiles.length 
      });
      
      return matchingProfiles;
    } catch (error) {
      this.logger?.error('Failed to search profiles by name', error as Error, { name });
      throw new Error(`Failed to search profiles: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findByGroup(groupId: string): Promise<Profile[]> {
    try {
      const allProfiles = await this.findAll();
      const matchingProfiles = allProfiles.filter(profile => 
        profile.groupId === groupId
      );
      
      this.logger?.debug('Profiles found by group', { 
        groupId, 
        count: matchingProfiles.length 
      });
      
      return matchingProfiles;
    } catch (error) {
      this.logger?.error('Failed to search profiles by group', error as Error, { groupId });
      throw new Error(`Failed to search profiles: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findByTags(tags: string[]): Promise<Profile[]> {
    try {
      const allProfiles = await this.findAll();
      const matchingProfiles = allProfiles.filter(profile => 
        tags.every(tag => profile.tags.includes(tag))
      );
      
      this.logger?.debug('Profiles found by tags', { 
        tags, 
        count: matchingProfiles.length 
      });
      
      return matchingProfiles;
    } catch (error) {
      this.logger?.error('Failed to search profiles by tags', error as Error, { tags });
      throw new Error(`Failed to search profiles: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async count(): Promise<number> {
    try {
      const allProfiles = await this.findAll();
      return allProfiles.length;
    } catch (error) {
      this.logger?.error('Failed to count profiles', error as Error);
      throw new Error(`Failed to count profiles: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const profilePath = path.join(this.profilesDir, `${id}.json`);
      return await fs.access(profilePath).then(() => true).catch(() => false);
    } catch (error) {
      this.logger?.error('Failed to check profile existence', error as Error, { profileId: id });
      return false;
    }
  }
}
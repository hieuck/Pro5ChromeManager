import { DomainEvent, EventPublisher } from '../../core/events/EventBus';
import { container, LoggerService } from '../../core/di/Container';

// Value Objects
export class ProfileId {
  constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('Profile ID cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: ProfileId): boolean {
    return this.value === other.value;
  }
}

export class ProfileName {
  constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('Profile name cannot be empty');
    }
    if (value.length > 100) {
      throw new Error('Profile name too long (max 100 characters)');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: ProfileName): boolean {
    return this.value === other.value;
  }
}

export class Fingerprint {
  constructor(
    public readonly userAgent: string,
    public readonly canvasNoise: number,
    public readonly webglRenderer: string,
    public readonly hardwareConcurrency: number,
    public readonly screenResolution: { width: number; height: number },
    public readonly timezone: string,
    public readonly languages: string[],
    public readonly platform: string
  ) {
    if (canvasNoise < 0 || canvasNoise > 1) {
      throw new Error('Canvas noise must be between 0 and 1');
    }
    if (hardwareConcurrency <= 0) {
      throw new Error('Hardware concurrency must be positive');
    }
  }

  equals(other: Fingerprint): boolean {
    return JSON.stringify(this) === JSON.stringify(other);
  }
}

export class ProxyConfig {
  constructor(
    public readonly host: string,
    public readonly port: number,
    public readonly type: 'http' | 'https' | 'socks4' | 'socks5',
    public readonly username?: string,
    public readonly password?: string
  ) {
    if (port <= 0 || port > 65535) {
      throw new Error('Invalid port number');
    }
  }

  toConnectionString(): string {
    const auth = this.username && this.password 
      ? `${this.username}:${this.password}@` 
      : '';
    return `${this.type}://${auth}${this.host}:${this.port}`;
  }

  equals(other: ProxyConfig): boolean {
    return this.toConnectionString() === other.toConnectionString();
  }
}

// Domain Events
export class ProfileCreatedDomainEvent extends DomainEvent {
  constructor(
    profileId: string,
    public readonly name: string,
    public readonly fingerprint: Fingerprint,
    public readonly groupId?: string
  ) {
    super('ProfileCreated', profileId);
  }
}

export class ProfileUpdatedDomainEvent extends DomainEvent {
  constructor(
    profileId: string,
    public readonly changes: Record<string, any>
  ) {
    super('ProfileUpdated', profileId);
  }
}

export class ProfileDeletedDomainEvent extends DomainEvent {
  constructor(profileId: string) {
    super('ProfileDeleted', profileId);
  }
}

// Aggregate Root
export class Profile {
  private _id: ProfileId;
  private _name: ProfileName;
  private _fingerprint: Fingerprint;
  private _proxy?: ProxyConfig;
  private _groupId?: string;
  private _ownerId?: string;
  private _tags: string[] = [];
  private _extensions: string[] = [];
  private _createdAt: Date;
  private _updatedAt: Date;
  private _lastUsedAt?: Date;
  private _totalSessions: number = 0;

  private constructor(
    id: ProfileId,
    name: ProfileName,
    fingerprint: Fingerprint,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date()
  ) {
    this._id = id;
    this._name = name;
    this._fingerprint = fingerprint;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  // Factory method for creation
  static create(
    id: ProfileId,
    name: ProfileName,
    fingerprint: Fingerprint
  ): Profile {
    const profile = new Profile(id, name, fingerprint);
    return profile;
  }

  // Factory method for reconstruction (from persistence)
  static reconstruct(
    id: ProfileId,
    name: ProfileName,
    fingerprint: Fingerprint,
    createdAt: Date,
    updatedAt: Date,
    proxy?: ProxyConfig,
    groupId?: string,
    ownerId?: string,
    tags: string[] = [],
    extensions: string[] = [],
    lastUsedAt?: Date,
    totalSessions: number = 0
  ): Profile {
    const profile = new Profile(id, name, fingerprint, createdAt, updatedAt);
    profile._proxy = proxy;
    profile._groupId = groupId;
    profile._ownerId = ownerId;
    profile._tags = tags;
    profile._extensions = extensions;
    profile._lastUsedAt = lastUsedAt;
    profile._totalSessions = totalSessions;
    return profile;
  }

  // Public getters
  get id(): ProfileId {
    return this._id;
  }

  get name(): ProfileName {
    return this._name;
  }

  get fingerprint(): Fingerprint {
    return this._fingerprint;
  }

  get proxy(): ProxyConfig | undefined {
    return this._proxy;
  }

  get groupId(): string | undefined {
    return this._groupId;
  }

  get ownerId(): string | undefined {
    return this._ownerId;
  }

  get tags(): string[] {
    return [...this._tags]; // Return copy to prevent mutation
  }

  get extensions(): string[] {
    return [...this._extensions]; // Return copy to prevent mutation
  }

  get createdAt(): Date {
    return new Date(this._createdAt); // Return copy to prevent mutation
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt); // Return copy to prevent mutation
  }

  get lastUsedAt(): Date | undefined {
    return this._lastUsedAt ? new Date(this._lastUsedAt) : undefined; // Return copy
  }

  get totalSessions(): number {
    return this._totalSessions;
  }

  // Business methods
  updateName(newName: ProfileName): void {
    if (!this._name.equals(newName)) {
      this._name = newName;
      this._updatedAt = new Date();
    }
  }

  assignProxy(proxy: ProxyConfig): void {
    if (!this._proxy || !this._proxy.equals(proxy)) {
      this._proxy = proxy;
      this._updatedAt = new Date();
    }
  }

  removeProxy(): void {
    if (this._proxy) {
      this._proxy = undefined;
      this._updatedAt = new Date();
    }
  }

  assignGroup(groupId: string): void {
    if (this._groupId !== groupId) {
      this._groupId = groupId;
      this._updatedAt = new Date();
    }
  }

  assignOwner(ownerId: string): void {
    if (this._ownerId !== ownerId) {
      this._ownerId = ownerId;
      this._updatedAt = new Date();
    }
  }

  addTag(tag: string): void {
    if (!this._tags.includes(tag)) {
      this._tags.push(tag);
      this._updatedAt = new Date();
    }
  }

  removeTag(tag: string): void {
    const index = this._tags.indexOf(tag);
    if (index !== -1) {
      this._tags.splice(index, 1);
      this._updatedAt = new Date();
    }
  }

  addExtension(extensionId: string): void {
    if (!this._extensions.includes(extensionId)) {
      this._extensions.push(extensionId);
      this._updatedAt = new Date();
    }
  }

  removeExtension(extensionId: string): void {
    const index = this._extensions.indexOf(extensionId);
    if (index !== -1) {
      this._extensions.splice(index, 1);
      this._updatedAt = new Date();
    }
  }

  recordUsage(): void {
    this._lastUsedAt = new Date();
    this._totalSessions++;
    this._updatedAt = new Date();
  }

  // Equality
  equals(other: Profile): boolean {
    return this._id.equals(other._id);
  }

  // For persistence
  toPersistence(): any {
    return {
      id: this._id.toString(),
      name: this._name.toString(),
      fingerprint: this._fingerprint,
      proxy: this._proxy,
      groupId: this._groupId,
      ownerId: this._ownerId,
      tags: this._tags,
      extensions: this._extensions,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      lastUsedAt: this._lastUsedAt?.toISOString(),
      totalSessions: this._totalSessions
    };
  }

  static fromPersistence(data: any): Profile {
    return Profile.reconstruct(
      new ProfileId(data.id),
      new ProfileName(data.name),
      new Fingerprint(
        data.fingerprint.userAgent,
        data.fingerprint.canvasNoise,
        data.fingerprint.webglRenderer,
        data.fingerprint.hardwareConcurrency,
        data.fingerprint.screenResolution,
        data.fingerprint.timezone,
        data.fingerprint.languages,
        data.fingerprint.platform
      ),
      new Date(data.createdAt),
      new Date(data.updatedAt),
      data.proxy ? new ProxyConfig(
        data.proxy.host,
        data.proxy.port,
        data.proxy.type,
        data.proxy.username,
        data.proxy.password
      ) : undefined,
      data.groupId,
      data.ownerId,
      data.tags,
      data.extensions,
      data.lastUsedAt ? new Date(data.lastUsedAt) : undefined,
      data.totalSessions
    );
  }
}
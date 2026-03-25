import { UploadFile } from 'antd/es/upload/interface';

export interface Profile {
  id: string;
  name: string;
  notes?: string;
  group?: string | null;
  owner?: string | null;
  tags: string[];
  proxy?: ProxyOption | null;
  proxyId?: string;
  runtime?: string;
  runtimeKey?: string;
  extensionIds: string[];
  status: 'stopped' | 'running' | 'unreachable' | 'stale';
  lastUsedAt?: string | null;
  totalSessions: number;
  schemaVersion: number;
}

export interface ExtensionRecord {
  id: string;
  name: string;
  version: string | null;
  enabled: boolean;
  category?: string | null;
}

export interface ExtensionBundle {
  key: string;
  label: string;
  extensionIds: string[];
  extensionCount: number;
}

export interface ProxyOption {
  id: string;
  label?: string;
  type: string;
  host: string;
  port: number;
  lastCheckAt?: string;
  lastCheckStatus?: 'healthy' | 'failing';
  lastCheckIp?: string;
  lastCheckTimezone?: string | null;
  lastCheckError?: string;
}

export interface Instance {
  profileId: string;
  status: 'running' | 'unreachable' | 'stopped';
  port?: number;
}

export interface RuntimeOption {
  key: string;
  available: boolean;
  label?: string;
  name?: string;
}

export interface BulkCreateResponse {
  total: number;
  profiles: Profile[];
}

import fs from 'fs/promises';
import path from 'path';
import { dataPath } from '../utils/dataPaths';

export interface OnboardingState {
  schemaVersion: number;
  status: 'not_started' | 'in_progress' | 'profile_created' | 'completed' | 'skipped';
  currentStep: number;
  selectedRuntime: string | null;
  draftProfileName: string | null;
  createdProfileId: string | null;
  lastOpenedAt: string | null;
  lastUpdatedAt: string | null;
  profileCreatedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
}

const CURRENT_SCHEMA_VERSION = 1;
const DEFAULT_STATE_PATH = dataPath('onboarding-state.json');

const DEFAULT_STATE: OnboardingState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  status: 'not_started',
  currentStep: 0,
  selectedRuntime: null,
  draftProfileName: null,
  createdProfileId: null,
  lastOpenedAt: null,
  lastUpdatedAt: null,
  profileCreatedAt: null,
  completedAt: null,
  skippedAt: null,
};

function migrateState(raw: Partial<OnboardingState> | null | undefined): OnboardingState {
  return {
    ...DEFAULT_STATE,
    ...(raw ?? {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export class OnboardingStateManager {
  private readonly statePath: string;
  private state: OnboardingState = { ...DEFAULT_STATE };
  private initialized = false;

  constructor(statePath?: string) {
    this.statePath = statePath ?? DEFAULT_STATE_PATH;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const raw = await fs.readFile(this.statePath, 'utf-8');
      this.state = migrateState(JSON.parse(raw) as Partial<OnboardingState>);
    } catch (err) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      this.state = { ...DEFAULT_STATE };
      if (!isNotFound) {
        await this.save();
      }
    }

    this.initialized = true;
  }

  getSnapshot(): OnboardingState {
    return { ...this.state };
  }

  async update(partial: Partial<Omit<OnboardingState, 'schemaVersion'>>): Promise<OnboardingState> {
    await this.initialize();
    this.state = migrateState({
      ...this.state,
      ...partial,
      lastUpdatedAt: new Date().toISOString(),
    });
    await this.save();
    return this.getSnapshot();
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }
}

export const onboardingStateManager = new OnboardingStateManager();

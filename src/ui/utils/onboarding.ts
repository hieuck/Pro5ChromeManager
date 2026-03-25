import { apiClient } from '../api/client';

export interface OnboardingStatePayload {
  status?: 'not_started' | 'in_progress' | 'profile_created' | 'completed' | 'skipped';
  currentStep?: number;
  selectedRuntime?: string | null;
  draftProfileName?: string | null;
  createdProfileId?: string | null;
  lastOpenedAt?: string | null;
  profileCreatedAt?: string | null;
  completedAt?: string | null;
  skippedAt?: string | null;
}

export async function syncOnboardingState(payload: OnboardingStatePayload): Promise<void> {
  const response = await apiClient.post('/api/support/onboarding-state', payload);
  if (!response.success) {
    throw new Error(response.error);
  }
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  const response = await apiClient.put('/api/config', { onboardingCompleted: completed });
  if (!response.success) {
    throw new Error(response.error);
  }
}

export async function finalizeOnboarding(payload: OnboardingStatePayload): Promise<void> {
  await syncOnboardingState(payload);
  await setOnboardingCompleted(true);
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  apiClient: {
    post: mocks.apiPost,
    put: mocks.apiPut,
  },
}));

describe('onboardingState', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
  });

  it('syncs onboarding state through the support endpoint', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, data: null });

    const { syncOnboardingState } = await import('./onboardingState');

    await expect(syncOnboardingState({
      status: 'in_progress',
      currentStep: 2,
      selectedRuntime: 'chrome',
    })).resolves.toBeUndefined();
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/support/onboarding-state', {
      status: 'in_progress',
      currentStep: 2,
      selectedRuntime: 'chrome',
    });
  });

  it('throws when onboarding state sync fails', async () => {
    mocks.apiPost.mockResolvedValue({ success: false, error: 'State save failed' });

    const { syncOnboardingState } = await import('./onboardingState');

    await expect(syncOnboardingState({ status: 'skipped' })).rejects.toThrow('State save failed');
  });

  it('updates onboarding completion and throws when config save fails', async () => {
    mocks.apiPut
      .mockResolvedValueOnce({ success: true, data: null })
      .mockResolvedValueOnce({ success: false, error: 'Config save failed' });

    const { setOnboardingCompleted } = await import('./onboardingState');

    await expect(setOnboardingCompleted(true)).resolves.toBeUndefined();
    await expect(setOnboardingCompleted(false)).rejects.toThrow('Config save failed');
    expect(mocks.apiPut).toHaveBeenNthCalledWith(1, '/api/config', { onboardingCompleted: true });
    expect(mocks.apiPut).toHaveBeenNthCalledWith(2, '/api/config', { onboardingCompleted: false });
  });

  it('finalizes onboarding in order and stops when state sync fails', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ success: true, data: null })
      .mockResolvedValueOnce({ success: false, error: 'State save failed' });
    mocks.apiPut.mockResolvedValue({ success: true, data: null });

    const { finalizeOnboarding } = await import('./onboardingState');

    await expect(finalizeOnboarding({ status: 'completed', currentStep: 3 })).resolves.toBeUndefined();
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/api/support/onboarding-state', {
      status: 'completed',
      currentStep: 3,
    });
    expect(mocks.apiPut).toHaveBeenNthCalledWith(1, '/api/config', { onboardingCompleted: true });

    await expect(finalizeOnboarding({ status: 'completed' })).rejects.toThrow('State save failed');
    expect(mocks.apiPut).toHaveBeenCalledTimes(1);
  });
});

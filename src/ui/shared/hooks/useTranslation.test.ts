import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  localStorageGetItem: vi.fn(),
}));

vi.mock('react', () => ({
  useMemo: <T>(factory: () => T) => factory(),
}));

describe('useTranslation', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.localStorageGetItem.mockReset();
    vi.stubGlobal('localStorage', {
      getItem: mocks.localStorageGetItem,
    });
  });

  it('falls back to Vietnamese when local storage has no valid user-facing language', async () => {
    mocks.localStorageGetItem.mockReturnValue('not-supported');

    const { useTranslation } = await import('./useTranslation');
    const translation = useTranslation();

    expect(translation.lang).toBe('vi');
    expect(translation.t.dashboard.checkRuntime).toBeTruthy();
    expect(translation.format('Hello {name}', { name: 'Codex' })).toBe('Hello Codex');
  });

  it('returns a stored user-facing language when available', async () => {
    mocks.localStorageGetItem.mockReturnValue('en');

    const { useTranslation } = await import('./useTranslation');
    const translation = useTranslation();

    expect(translation.lang).toBe('en');
    expect(translation.t.dashboard.checkRuntime).toBeTruthy();
  });

  it('accepts the pseudo locale in development builds', async () => {
    mocks.localStorageGetItem.mockReturnValue('qps-ploc');

    const { useTranslation } = await import('./useTranslation');
    const translation = useTranslation();

    expect(translation.lang).toBe('qps-ploc');
  });
});

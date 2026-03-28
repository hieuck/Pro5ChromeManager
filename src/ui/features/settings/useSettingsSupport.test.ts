import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  buildSupportSummaryLines: vi.fn(() => ['summary line 1', 'summary line 2']),
  feedbackForm: {
    resetFields: vi.fn(),
    validateFields: vi.fn(),
  },
  formQueue: [] as Array<[unknown]>,
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  stateCursor: 0,
  stateOverrides: [] as unknown[],
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  writeText: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useEffect: (effect: () => void | Promise<void>) => {
    void effect();
  },
  useState: <T>(initial: T) => {
    const index = mocks.stateCursor;
    const setter = vi.fn();
    mocks.stateSetters[index] = setter;
    mocks.stateCursor += 1;

    const hasOverride = Object.prototype.hasOwnProperty.call(mocks.stateOverrides, index);
    const value = hasOverride ? mocks.stateOverrides[index] as T : initial;

    return [value, setter] as const;
  },
}));

vi.mock('antd', () => ({
  Form: {
    useForm: () => mocks.formQueue.shift() ?? [mocks.feedbackForm],
  },
  message: {
    error: mocks.messageError,
    success: mocks.messageSuccess,
    warning: mocks.messageWarning,
  },
}));

vi.mock('../../api/client', () => ({
  apiClient: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}));

vi.mock('./settingsSupport.utils', () => ({
  buildSupportSummaryLines: mocks.buildSupportSummaryLines,
  formatUptime: vi.fn((seconds: number) => `${seconds}s`),
  getFeedbackCategoryLabel: vi.fn(() => 'Feedback'),
  getFeedbackSentimentLabel: vi.fn(() => 'Neutral'),
  getIncidentCategoryColor: vi.fn(() => 'default'),
  getIncidentLevelLabel: vi.fn(() => 'Warn'),
  getOnboardingStateLabel: vi.fn(() => 'Not started'),
  getSelfTestStatusLabel: vi.fn(() => 'Pass'),
}));

function createTranslation() {
  return {
    settings: {
      feedbackSaved: 'Feedback saved',
      supportSelfTestCompleted: 'Self-test completed',
      supportStatusLoadFailed: 'Support status load failed',
      supportSummaryCopied: 'Support summary copied',
      supportSummaryCopyFailed: 'Support summary copy failed',
      supportSummaryUnavailable: 'Support summary unavailable',
    },
  } as const;
}

function createSupportStatus() {
  return {
    appVersion: '1.2.3',
  };
}

function createIncidentState() {
  return {
    incidents: [{ id: 'incident-1' }],
  };
}

function createFeedbackState() {
  return {
    entries: [{ id: 'feedback-1' }],
  };
}

describe('useSettingsSupport', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.buildSupportSummaryLines.mockClear();
    mocks.feedbackForm.resetFields.mockReset();
    mocks.feedbackForm.validateFields.mockReset();
    mocks.formQueue = [[mocks.feedbackForm]];
    mocks.messageError.mockReset();
    mocks.messageSuccess.mockReset();
    mocks.messageWarning.mockReset();
    mocks.stateCursor = 0;
    mocks.stateOverrides = [];
    mocks.stateSetters = [];
    mocks.writeText.mockReset();

    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: mocks.writeText,
      },
    });
  });

  it('loads support status, incidents, and feedback on startup', async () => {
    mocks.apiGet
      .mockResolvedValueOnce({ success: true, data: createSupportStatus() })
      .mockResolvedValueOnce({ success: true, data: createIncidentState() })
      .mockResolvedValueOnce({ success: true, data: createFeedbackState() });

    const { useSettingsSupport } = await import('./useSettingsSupport');
    const hook = useSettingsSupport(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(3);
    });

    expect(hook.loadingSupport).toBe(false);
    expect(mocks.apiGet.mock.calls.map(([path]) => path)).toEqual([
      '/api/support/status',
      '/api/support/incidents?limit=10',
      '/api/support/feedback?limit=5',
    ]);
    expect(mocks.stateSetters[0]).toHaveBeenCalledWith(createSupportStatus());
    expect(mocks.stateSetters[2]).toHaveBeenCalledWith(createIncidentState());
    expect(mocks.stateSetters[3]).toHaveBeenCalledWith(createFeedbackState());
    expect(mocks.stateSetters[4]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[4]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.stateSetters[6]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[6]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.stateSetters[7]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[7]).toHaveBeenNthCalledWith(2, false);
  });

  it('reports support status load failures and still clears the loading flag', async () => {
    mocks.apiGet
      .mockResolvedValueOnce({ success: false, error: 'failed' })
      .mockResolvedValueOnce({ success: true, data: createIncidentState() })
      .mockResolvedValueOnce({ success: true, data: createFeedbackState() });

    const { useSettingsSupport } = await import('./useSettingsSupport');
    useSettingsSupport(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(3);
    });

    expect(mocks.messageError).toHaveBeenCalledWith('Support status load failed');
    expect(mocks.stateSetters[4]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[4]).toHaveBeenNthCalledWith(2, false);
  });

  it('runs self-test and submits feedback with refreshes on success', async () => {
    mocks.stateOverrides[0] = createSupportStatus();
    mocks.apiGet
      .mockResolvedValueOnce({ success: true, data: createSupportStatus() })
      .mockResolvedValueOnce({ success: true, data: createIncidentState() })
      .mockResolvedValueOnce({ success: true, data: createFeedbackState() })
      .mockResolvedValueOnce({ success: true, data: { appVersion: '2.0.0' } })
      .mockResolvedValueOnce({ success: true, data: { entries: [{ id: 'feedback-2' }] } });
    mocks.apiPost
      .mockResolvedValueOnce({ success: true, data: { status: 'pass' } })
      .mockResolvedValueOnce({ success: true, data: { id: 'feedback-2' } });
    mocks.feedbackForm.validateFields.mockResolvedValue({
      category: 'bug',
      email: 'qa@example.com',
      message: 'Need more diagnostics',
      sentiment: 'negative',
    });

    const { useSettingsSupport } = await import('./useSettingsSupport');
    const hook = useSettingsSupport(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(3);
    });

    await hook.runSelfTest();
    await hook.handleSubmitFeedback();

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/api/support/self-test');
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/api/support/feedback', {
      appVersion: '1.2.3',
      category: 'bug',
      email: 'qa@example.com',
      message: 'Need more diagnostics',
      sentiment: 'negative',
    });
    expect(mocks.feedbackForm.resetFields).toHaveBeenCalledOnce();
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Self-test completed');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Feedback saved');
    expect(mocks.stateSetters[1]).toHaveBeenCalledWith({ status: 'pass' });
    expect(mocks.stateSetters[5]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[5]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.stateSetters[8]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[8]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.apiGet).toHaveBeenCalledTimes(5);
  });

  it('warns when support summary is unavailable and copies it when data exists', async () => {
    mocks.apiGet
      .mockResolvedValueOnce({ success: true, data: createSupportStatus() })
      .mockResolvedValueOnce({ success: true, data: createIncidentState() })
      .mockResolvedValueOnce({ success: true, data: createFeedbackState() });

    const { useSettingsSupport } = await import('./useSettingsSupport');
    const emptyHook = useSettingsSupport(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(3);
    });

    await emptyHook.handleCopySupportSummary();
    expect(mocks.messageWarning).toHaveBeenCalledWith('Support summary unavailable');

    vi.resetModules();
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.feedbackForm.resetFields.mockReset();
    mocks.feedbackForm.validateFields.mockReset();
    mocks.formQueue = [[mocks.feedbackForm]];
    mocks.messageError.mockReset();
    mocks.messageSuccess.mockReset();
    mocks.messageWarning.mockReset();
    mocks.stateCursor = 0;
    mocks.stateOverrides = [createSupportStatus(), null, createIncidentState()];
    mocks.stateSetters = [];
    mocks.writeText.mockReset();
    mocks.apiGet
      .mockResolvedValueOnce({ success: true, data: createSupportStatus() })
      .mockResolvedValueOnce({ success: true, data: createIncidentState() })
      .mockResolvedValueOnce({ success: true, data: createFeedbackState() });

    const { useSettingsSupport: useSettingsSupportAgain } = await import('./useSettingsSupport');
    const populatedHook = useSettingsSupportAgain(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(3);
    });

    await populatedHook.handleCopySupportSummary();

    expect(mocks.buildSupportSummaryLines).toHaveBeenCalledOnce();
    expect(mocks.writeText).toHaveBeenCalledWith('summary line 1\nsummary line 2');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Support summary copied');
  });

  it('shows copy errors when the clipboard write fails', async () => {
    mocks.stateOverrides = [createSupportStatus()];
    mocks.apiGet
      .mockResolvedValueOnce({ success: true, data: createSupportStatus() })
      .mockResolvedValueOnce({ success: true, data: createIncidentState() })
      .mockResolvedValueOnce({ success: true, data: createFeedbackState() });
    mocks.writeText.mockRejectedValueOnce(new Error('clipboard failed'));

    const { useSettingsSupport } = await import('./useSettingsSupport');
    const hook = useSettingsSupport(createTranslation() as never);

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(3);
    });

    await hook.handleCopySupportSummary();
    expect(mocks.messageError).toHaveBeenCalledWith('Support summary copy failed');
  });
});

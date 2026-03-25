import { chromium, expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';

interface ProfileRecord {
  id: string;
}

interface RuntimeRecord {
  key: string;
}

async function setOnboardingCompleted(request: APIRequestContext, completed: boolean): Promise<void> {
  const response = await request.put('/api/config', {
    data: {
      onboardingCompleted: completed,
    },
  });
  const json = await response.json() as { success: boolean; error?: string };
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to update onboarding state');
  }
}

async function resetOnboardingState(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/support/onboarding-state', {
    data: {
      status: 'not_started',
      currentStep: 0,
      selectedRuntime: null,
      draftProfileName: null,
      createdProfileId: null,
      lastOpenedAt: null,
      profileCreatedAt: null,
      completedAt: null,
      skippedAt: null,
    },
  });
  const json = await response.json() as { success: boolean; error?: string };
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to reset onboarding state');
  }
}

async function deleteAllProfiles(request: APIRequestContext): Promise<void> {
  const listResponse = await request.get('/api/profiles');
  const listJson = await listResponse.json() as {
    success: boolean;
    error?: string;
    data: ProfileRecord[];
  };

  if (!listJson.success) {
    throw new Error(listJson.error ?? 'Failed to list profiles');
  }

  for (const profile of listJson.data) {
    await request.delete(`/api/profiles/${profile.id}`);
  }
}

async function listRuntimes(request: APIRequestContext): Promise<RuntimeRecord[]> {
  const response = await request.get('/api/runtimes');
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: RuntimeRecord[];
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to list runtimes');
  }

  return json.data;
}

async function ensureE2eRuntime(request: APIRequestContext): Promise<void> {
  const runtimes = await listRuntimes(request);
  if (runtimes.some((runtime) => runtime.key === 'e2e')) {
    return;
  }

  const response = await request.post('/api/runtimes', {
    data: {
      key: 'e2e',
      label: 'E2E Runtime',
      executablePath: chromium.executablePath(),
    },
  });
  const json = await response.json() as { success: boolean; error?: string };
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to restore E2E runtime');
  }
}

async function restoreE2eRuntime(): Promise<void> {
  const request = await playwrightRequest.newContext({
    baseURL: 'http://127.0.0.1:33211',
  });

  try {
    await ensureE2eRuntime(request);
  } finally {
    await request.dispose();
  }
}

test.describe('Profile onboarding', () => {
  test('walks a first-run user from welcome screen to the first profile', async ({ page, request }) => {
    const profileName = `Onboarding Profile ${Date.now()}`;

    await deleteAllProfiles(request);
    await ensureE2eRuntime(request);
    await setOnboardingCompleted(request, false);
    await resetOnboardingState(request);

    await page.goto('/ui/profiles');
    await expect(page).toHaveURL(/\/ui\/profiles$/);
    await expect(page.getByRole('heading', { name: /ch.+o m.+ng/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /t.+o profile .+u ti.+n/i })).toBeVisible();

    await page.getByRole('button', { name: /t.+o profile .+u ti.+n/i }).click();

    const wizard = page.getByRole('dialog');
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText(/thi.+t l.+p ban .+u/i);
    await expect(wizard).toContainText('E2E Runtime');

    await wizard.getByRole('button', { name: /ti.+p theo/i }).click();
    await wizard.getByPlaceholder(/t.+n profile/i).fill(profileName);
    await wizard.getByRole('button', { name: /t.+o profile/i }).click();

    await expect(wizard).toContainText(profileName);
    await wizard.getByRole('button', { name: /b.+t .+u/i }).click();

    await expect(wizard).toBeHidden();
    await expect(page.locator('main h3')).toContainText(/h.+ sơ|profile/i);
    await expect(page.getByRole('button', { name: profileName })).toBeVisible();

    await expect
      .poll(async () => {
        const configResponse = await request.get('/api/config');
        const configJson = await configResponse.json() as {
          success: boolean;
          data: { onboardingCompleted: boolean };
        };
        return configJson.success && configJson.data.onboardingCompleted;
      })
      .toBe(true);
  });

  test('marks onboarding as skipped when the user skips from the welcome flow', async ({ page, request }) => {
    await deleteAllProfiles(request);
    await ensureE2eRuntime(request);
    await setOnboardingCompleted(request, false);
    await resetOnboardingState(request);

    await page.goto('/ui/profiles');
    await expect(page).toHaveURL(/\/ui\/profiles$/);
    await expect(page.getByRole('heading', { name: /ch.+o m.+ng/i })).toBeVisible();

    await page.getByRole('button', { name: /b.+ qua/i }).click();

    await expect(page.getByRole('heading', { level: 3, name: /profile manager|h.+ s.+/i })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const configResponse = await request.get('/api/config');
    const configJson = await configResponse.json() as {
      success: boolean;
      data: { onboardingCompleted: boolean };
    };
    expect(configJson.success).toBe(true);
    expect(configJson.data.onboardingCompleted).toBe(true);

    const supportResponse = await request.get('/api/support/status');
    const supportJson = await supportResponse.json() as {
      success: boolean;
      data: {
        onboardingCompleted: boolean;
        onboardingState: {
          status: string;
          skippedAt: string | null;
        };
      };
    };
    expect(supportJson.success).toBe(true);
    expect(supportJson.data.onboardingCompleted).toBe(true);
    expect(supportJson.data.onboardingState.status).toBe('skipped');
    expect(supportJson.data.onboardingState.skippedAt).toBeTruthy();
  });

  test('blocks onboarding progress when no browser runtime is available', async ({ page, request }) => {
    await deleteAllProfiles(request);
    await setOnboardingCompleted(request, false);
    await resetOnboardingState(request);

    const runtimes = await listRuntimes(request);
    await Promise.all(
      runtimes.map(async (runtime) => {
        const response = await request.delete(`/api/runtimes/${runtime.key}`);
        const json = await response.json() as { success: boolean; error?: string };
        if (!json.success) {
          throw new Error(json.error ?? `Failed to delete runtime ${runtime.key}`);
        }
      }),
    );

    try {
      await page.goto('/ui/profiles');
      await expect(page).toHaveURL(/\/ui\/profiles$/);
      await page.getByRole('button', { name: /t.+o profile .+u ti.+n/i }).click();

      const wizard = page.getByRole('dialog');
      await expect(wizard).toBeVisible();
      await expect(wizard).toContainText(/kh.+ng t.+m th.+y tr.+nh duy.+t n.+o/i);
      await expect(wizard.getByRole('button', { name: /ti.+p theo/i })).toBeDisabled();

      await wizard.getByRole('button', { name: /m.+ c.+i .+t/i }).click();
      await expect(page).toHaveURL(/\/ui\/settings$/);
      await expect(page.getByRole('heading', { level: 3 })).toContainText(/c.+i .+t/i);
    } finally {
      await restoreE2eRuntime();
    }
  });

  test('restarts onboarding from the first step when opened again from settings', async ({ page, request }) => {
    const profileName = `Replay Onboarding ${Date.now()}`;

    await deleteAllProfiles(request);
    await ensureE2eRuntime(request);
    await setOnboardingCompleted(request, false);
    await resetOnboardingState(request);

    await page.goto('/ui/settings');
    await expect(page).toHaveURL(/\/ui\/settings$/);
    await expect(page.getByRole('heading', { level: 3 })).toContainText(/c.+i .+t/i);

    await page.getByRole('button', { name: /xem l.+i h.+ng d.+n/i }).click();

    let wizard = page.getByRole('dialog');
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText(/ch.+n tr.+nh duy.+t chromium/i);

    await wizard.getByRole('button', { name: /ti.+p theo/i }).click();
    await wizard.getByPlaceholder(/t.+n profile/i).fill(profileName);
    await wizard.getByRole('button', { name: /t.+o profile/i }).click();
    await expect(wizard).toContainText(profileName);
    await wizard.getByRole('button', { name: /b.+t .+u/i }).click();
    await expect(wizard).toBeHidden();

    await page.getByRole('button', { name: /xem l.+i h.+ng d.+n/i }).click();

    wizard = page.getByRole('dialog');
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText(/ch.+n tr.+nh duy.+t chromium/i);
    await expect(wizard).not.toContainText(profileName);
  });
});

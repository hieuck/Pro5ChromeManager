import { expect, test, type APIRequestContext } from '@playwright/test';

interface ProfileRecord {
  id: string;
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

test.describe('Profile onboarding', () => {
  test('walks a first-run user from welcome screen to the first profile', async ({ page, request }) => {
    const profileName = `Onboarding Profile ${Date.now()}`;

    await deleteAllProfiles(request);
    await setOnboardingCompleted(request, false);

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

    const configResponse = await request.get('/api/config');
    const configJson = await configResponse.json() as {
      success: boolean;
      data: { onboardingCompleted: boolean };
    };
    expect(configJson.success).toBe(true);
    expect(configJson.data.onboardingCompleted).toBe(true);
  });

  test('marks onboarding as skipped when the user skips from the welcome flow', async ({ page, request }) => {
    await deleteAllProfiles(request);
    await setOnboardingCompleted(request, false);

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
});

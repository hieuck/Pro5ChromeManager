import { chromium, expect, test, type APIRequestContext } from '@playwright/test';

interface ProfileRecord {
  id: string;
  name: string;
}

interface InstanceRecord {
  remoteDebuggingPort: number;
}

async function ensureE2eRuntime(request: APIRequestContext): Promise<void> {
  const runtimeResponse = await request.get('/api/runtimes');
  const runtimeJson = await runtimeResponse.json() as {
    success: boolean;
    data: Array<{ key: string }>;
    error?: string;
  };

  if (!runtimeJson.success) {
    throw new Error(runtimeJson.error ?? 'Failed to list runtimes');
  }

  if (runtimeJson.data.some((runtime) => runtime.key === 'e2e')) {
    return;
  }

  const createResponse = await request.post('/api/runtimes', {
    data: {
      key: 'e2e',
      label: 'E2E Runtime',
      executablePath: chromium.executablePath(),
    },
  });
  const createJson = await createResponse.json() as { success: boolean; error?: string };
  if (!createJson.success) {
    throw new Error(createJson.error ?? 'Failed to create E2E runtime');
  }
}

async function deleteAllProfiles(request: APIRequestContext): Promise<void> {
  const response = await request.get('/api/profiles');
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: ProfileRecord[];
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to list profiles');
  }

  for (const profile of json.data) {
    const deleteResponse = await request.delete(`/api/profiles/${profile.id}`);
    const deleteJson = await deleteResponse.json() as { success: boolean; error?: string };
    if (!deleteJson.success) {
      throw new Error(deleteJson.error ?? `Failed to delete profile ${profile.id}`);
    }
  }
}

async function stopAllInstances(request: APIRequestContext): Promise<void> {
  const response = await request.get('/api/instances');
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: Array<{ profileId: string }>;
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to list instances');
  }

  await Promise.all(json.data.map(async (instance) => {
    const stopResponse = await request.post(`/api/profiles/${instance.profileId}/stop`);
    const stopJson = await stopResponse.json() as { success: boolean; error?: string };
    if (!stopJson.success) {
      throw new Error(stopJson.error ?? `Failed to stop instance ${instance.profileId}`);
    }
  }));
}

test.describe('Profile browser identity', () => {
  test('injects a persistent profile badge and title prefix into launched pages', async ({ request }) => {
    test.setTimeout(90_000);
    await ensureE2eRuntime(request);
    await stopAllInstances(request);
    await deleteAllProfiles(request);

    const profileName = `Identity Profile ${Date.now()}`;
    const createResponse = await request.post('/api/profiles', {
      data: {
        name: profileName,
        group: 'Growth',
        owner: 'alice',
        runtime: 'e2e',
      },
    });
    const createJson = await createResponse.json() as {
      success: boolean;
      error?: string;
      data: ProfileRecord;
    };
    expect(createJson.success).toBe(true);

    const startResponse = await request.post(`/api/profiles/${createJson.data.id}/start`);
    const startJson = await startResponse.json() as {
      success: boolean;
      error?: string;
      data: InstanceRecord;
    };
    expect(startJson.success).toBe(true);

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${startJson.data.remoteDebuggingPort}`);

    try {
      const context = browser.contexts()[0];
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:33211/');

      const badge = page.locator('#pro5-profile-identity-badge');
      await expect(badge).toBeVisible();
      await expect(badge).toContainText(profileName);
      await expect(badge).toContainText(/Growth\s*\/\s*alice/);
      await expect(page).toHaveTitle(new RegExp(`\\[${profileName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\]`));
    } finally {
      await browser.close().catch(() => undefined);
      await request.post(`/api/profiles/${createJson.data.id}/stop`).catch(() => undefined);
    }
  });
});

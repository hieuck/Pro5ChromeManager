import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

interface ProxyRecord {
  id: string;
  host: string;
  port: number;
  type: string;
  label?: string;
}

interface ProfileRecord {
  id: string;
  name: string;
  group?: string | null;
  notes?: string;
  runtime?: string;
  proxy?: { id: string } | null;
}

async function completeOnboardingViaApi(request: APIRequestContext): Promise<void> {
  const response = await request.put('/api/config', {
    data: {
      onboardingCompleted: true,
    },
  });
  const json = await response.json() as { success: boolean; error?: string };
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to update onboarding state');
  }
}

async function gotoProfileWorkspace(page: Page): Promise<void> {
  await page.goto('/ui/profiles');
  await expect(page).toHaveURL(/\/ui\/profiles$/);
  await expect(page.locator('main h3')).toContainText(/h.+ sơ|profile/i);
  await expect(page.getByRole('button', { name: /t.+o.+h.+ sơ/i })).toBeVisible();
}

async function createProxyViaApi(request: APIRequestContext, host: string, port: number, label: string): Promise<ProxyRecord> {
  const response = await request.post('/api/proxies', {
    data: {
      host,
      port,
      type: 'http',
      label,
    },
  });

  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: ProxyRecord;
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to create proxy');
  }

  return json.data;
}

async function createProfileViaApi(
  request: APIRequestContext,
  payload: { name: string; notes?: string; group?: string | null; runtime?: string; proxyId?: string | null },
): Promise<ProfileRecord> {
  const response = await request.post('/api/profiles', { data: payload });
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: ProfileRecord;
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to create profile');
  }

  return json.data;
}

function profileRow(page: Page, name: string) {
  return page.locator('tbody tr').filter({ has: page.getByRole('button', { name }) });
}

async function openCreateProfileDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: /t.+o.+h.+ sơ/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Profile workspace', () => {
  test('creates a profile with a custom runtime and proxy from the workspace', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    const proxy = await createProxyViaApi(request, `198.51.100.${Math.floor(Math.random() * 30) + 20}`, 8400, `Seed ${uniqueId}`);
    const profileName = `E2E Profile ${uniqueId}`;
    const profileGroup = `Ops ${uniqueId}`;

    await gotoProfileWorkspace(page);
    await openCreateProfileDrawer(page);

    const drawer = page.getByRole('dialog');
    await drawer.getByLabel(/t.+n h.+ sơ/i).fill(profileName);
    await drawer.getByLabel(/nh.+m/i).fill(profileGroup);

    await drawer.getByRole('tabpanel', { name: /chung/i }).locator('.ant-select').nth(1).locator('.ant-select-selector').click();
    await page.locator('.ant-select-dropdown').getByText('E2E Runtime').click();

    await drawer.getByRole('tab', { name: /proxy/i }).click();
    await drawer.getByRole('tabpanel', { name: /proxy/i }).locator('.ant-select').locator('.ant-select-selector').click();
    await page.locator('.ant-select-dropdown').getByText(`${proxy.host}:${proxy.port}`).click();

    await drawer.getByRole('button', { name: /^t.+o$/i }).click();
    await expect(drawer).toBeHidden();

    const row = profileRow(page, profileName);
    await expect(row).toBeVisible();
    await expect(row.getByText(profileGroup)).toBeVisible();
    await expect(row.getByText(`${proxy.host}:${proxy.port}`)).toBeVisible();

    await row.getByRole('button', { name: profileName }).click();
    const editDrawer = page.getByRole('dialog');
    await expect(editDrawer).toBeVisible();
    await expect(editDrawer.getByLabel(/t.+n h.+ sơ/i)).toHaveValue(profileName);
    await expect(editDrawer.getByLabel(/nh.+m/i)).toHaveValue(profileGroup);
    await expect(editDrawer.getByRole('tabpanel', { name: /chung/i })).toContainText('E2E Runtime');
    await editDrawer.getByRole('tab', { name: /proxy/i }).click();
    await expect(editDrawer.getByRole('tabpanel', { name: /proxy/i })).toContainText(`${proxy.host}:${proxy.port}`);
  });

  test('updates an existing profile from the workspace and persists the changes', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    const initialName = `Editable Profile ${uniqueId}`;
    const created = await createProfileViaApi(request, {
      name: initialName,
      group: 'Initial Group',
      notes: 'Initial note',
      runtime: 'e2e',
    });
    const updatedGroup = `Updated Group ${uniqueId}`;
    const updatedNotes = `Updated note ${uniqueId}`;

    await gotoProfileWorkspace(page);

    const row = profileRow(page, initialName);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: initialName }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel(/t.+n h.+ sơ/i)).toHaveValue(created.name);

    await drawer.getByLabel(/nh.+m/i).fill(updatedGroup);
    await drawer.getByLabel(/ghi ch.+/i).fill(updatedNotes);
    await drawer.getByRole('tabpanel', { name: /chung/i }).locator('.ant-select').nth(1).locator('.ant-select-selector').click();
    await page.locator('.ant-select-dropdown').getByText(/t.+ đ.+ng/i).click();

    await drawer.getByRole('button', { name: /l.+u/i }).click();
    await expect(drawer).toBeHidden();

    await expect(row.getByText(updatedGroup)).toBeVisible();

    await row.getByRole('button', { name: initialName }).click();
    const reopenedDrawer = page.getByRole('dialog');
    await expect(reopenedDrawer.getByLabel(/nh.+m/i)).toHaveValue(updatedGroup);
    await expect(reopenedDrawer.getByLabel(/ghi ch.+/i)).toHaveValue(updatedNotes);
    await expect(reopenedDrawer.getByRole('tabpanel', { name: /chung/i })).toContainText(/t.+ đ.+ng/i);
  });
});

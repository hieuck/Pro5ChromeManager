import { chromium, expect, request as playwrightRequest, test, type APIRequestContext, type Page } from '@playwright/test';

interface DashboardProfileRecord {
  id: string;
}

interface BackupEntry {
  filename: string;
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
  const response = await request.get('/api/profiles');
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: DashboardProfileRecord[];
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

async function listBackups(request: APIRequestContext): Promise<BackupEntry[]> {
  const response = await request.get('/api/backups');
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: BackupEntry[];
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to list backups');
  }

  return json.data;
}

async function listRuntimes(request: APIRequestContext): Promise<Array<{ key: string }>> {
  const response = await request.get('/api/runtimes');
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: Array<{ key: string }>;
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

async function gotoDashboard(page: Page): Promise<void> {
  await page.goto('/ui/dashboard');
  await expect(page).toHaveURL(/\/ui\/dashboard$/);
  await expect(page.getByRole('heading', { level: 2 })).toContainText(/bảng điều khiển vận hành/i);
}

async function gotoLogs(page: Page): Promise<void> {
  await page.goto('/ui/logs');
  await expect(page).toHaveURL(/\/ui\/logs$/);
  await expect(page.getByRole('heading', { level: 3 })).toContainText(/nhật ký hệ thống/i);
}

async function gotoSettings(page: Page): Promise<void> {
  await page.goto('/ui/settings');
  await expect(page).toHaveURL(/\/ui\/settings$/);
  await expect(page.getByRole('heading', { level: 3 })).toContainText(/cài đặt/i);
}

test.describe('Ops surfaces', () => {
  test('shows runtime readiness and opens the proxy workspace from the dashboard', async ({ page, request }) => {
    await ensureE2eRuntime(request);
    await setOnboardingCompleted(request, true);
    await resetOnboardingState(request);

    await gotoDashboard(page);

    await expect(page.getByText(/E2E Runtime:\s*Sẵn sàng/i)).toBeVisible();
    await expect(page.getByText(/undefined:\s*Sẵn sàng/i)).toHaveCount(0);
    await expect(page.getByText(/Nguồn hoạt động chính:\s*app-\d{4}-\d{2}-\d{2}\.log/i).first()).toBeVisible();
    await expect(page.locator('.ant-tag').filter({ hasText: /Debug:\s*\d+/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /mở proxy/i }).first().click();
    await expect(page).toHaveURL(/\/ui\/proxies$/);
    await expect(page.getByRole('heading', { level: 3 })).toContainText(/proxy/i);
    await expect(page.getByRole('button', { name: 'Import proxy' })).toBeVisible();
  });

  test('renders parsed log levels and sources in the logs workspace', async ({ page }) => {
    await gotoLogs(page);

    await expect(page.locator('.ant-statistic').filter({ hasText: /Debug/i })).toBeVisible();
    await expect(page.locator('.ant-statistic').filter({ hasText: /Thông tin/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4 }).filter({ hasText: /DEBUG/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 4 }).filter({ hasText: /app-\d{4}-\d{2}-\d{2}\.log/i }).first()).toBeVisible();

    await page.getByRole('searchbox', { name: /tìm trong nhật ký/i }).fill('WebSocket client connected');
    await expect(page.getByText(/WebSocket client connected/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 4 }).filter({ hasText: /app-\d{4}-\d{2}-\d{2}\.log/i }).first()).toBeVisible();
  });

  test('keeps the general settings tab localized in Vietnamese', async ({ page }) => {
    await gotoSettings(page);

    await expect(page.getByText(/Ngôn ngữ giao diện/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Lưu cài đặt/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Xem lại hướng dẫn/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Xuất diagnostics/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Export Diagnostics$/i })).toHaveCount(0);
  });
  test('submits support feedback from settings and shows the saved entry', async ({ page }) => {
    const uniqueMessage = `E2E support feedback ${Date.now()}`;

    await gotoSettings(page);
    await page.getByRole('tab', { name: /h.+ tr.+|support/i }).click();

    await expect(page.getByRole('button', { name: /copy support summary/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /ch.+y self-test|run self-test/i })).toBeVisible();

    await page.getByRole('textbox', { name: /n.+i dung|message/i }).fill(uniqueMessage);
    await page.getByRole('textbox', { name: /email/i }).fill('ops-e2e@example.com');
    await page.getByRole('button', { name: /l.+u feedback|save feedback/i }).click();

    await expect(page.getByText(uniqueMessage)).toBeVisible();
    await expect(page.getByText(/ops-e2e@example\.com/i)).toBeVisible();
  });

  test('runs support self-test from settings and shows the latest result', async ({ page }) => {
    await gotoSettings(page);
    await page.getByRole('tab', { name: /h.+ tr.+|support/i }).click();

    await page.getByRole('button', { name: /ch.+y self-test|run self-test/i }).click();

    await expect(page.getByText(/self-test/i).first()).toBeVisible();
    await expect(page.locator('.ant-tag').filter({ hasText: /đạt|cảnh báo|lỗi|pass|warn|fail/i }).first()).toBeVisible();
    await expect(page.getByText(/runtime|diagnostics|proxy|data dir/i).first()).toBeVisible();
  });

  test('creates a backup from the dashboard and surfaces the latest backup entry', async ({ page, request }) => {
    const beforeBackups = await listBackups(request);
    await setOnboardingCompleted(request, true);
    await resetOnboardingState(request);

    await gotoDashboard(page);
    await page.getByRole('button', { name: /backup ngay|create backup/i }).first().click();

    await expect
      .poll(async () => (await listBackups(request)).length)
      .toBeGreaterThan(beforeBackups.length);

    const afterBackups = await listBackups(request);
    const latestBackup = afterBackups[0];
    expect(latestBackup).toBeTruthy();

    await expect(page.getByText(latestBackup.filename).first()).toBeVisible();
  });

  test('opens the first-profile creation flow from the dashboard when no profiles exist', async ({ page, request }) => {
    await deleteAllProfiles(request);
    await ensureE2eRuntime(request);
    await setOnboardingCompleted(request, true);
    await resetOnboardingState(request);

    await gotoDashboard(page);
    await page.getByRole('button', { name: /t.+o h.+ s.+ .+u ti.+n/i }).first().click();

    await expect(page).toHaveURL(/\/ui\/profiles$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/t.+n h.+ s.+/i);
  });

  test('routes create-first-profile actions into onboarding when no runtime is available', async ({ page, request }) => {
    await deleteAllProfiles(request);
    await setOnboardingCompleted(request, true);
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
      await gotoDashboard(page);
      await expect(page.getByRole('button', { name: /s.+a thi.+t l.+p runtime/i }).first()).toBeVisible();
      await page.getByRole('button', { name: /t.+o h.+ s.+ .+u ti.+n/i }).first().click();

      const wizard = page.getByRole('dialog');
      await expect(wizard).toBeVisible();
      await expect(wizard).toContainText(/kh.+ng t.+m th.+y tr.+nh duy.+t n.+o/i);
      await expect(wizard.getByRole('button', { name: /ti.+p theo/i })).toBeDisabled();
      await expect(page).not.toHaveURL(/\/ui\/profiles$/);
    } finally {
      await restoreE2eRuntime();
    }
  });

  test('auto-opens onboarding on the dashboard for first-run users', async ({ page, request }) => {
    await deleteAllProfiles(request);
    await ensureE2eRuntime(request);
    await setOnboardingCompleted(request, false);
    await resetOnboardingState(request);

    await gotoDashboard(page);

    const wizard = page.getByRole('dialog');
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText(/thi.+t l.+p ban .+u/i);
    await expect(wizard).toContainText('E2E Runtime');
  });
});

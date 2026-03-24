import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

interface DashboardProfileRecord {
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
  test('shows runtime readiness and opens the proxy workspace from the dashboard', async ({ page }) => {
    await gotoDashboard(page);

    await expect(page.getByText(/E2E Runtime:\s*Sẵn sàng/i)).toBeVisible();
    await expect(page.getByText(/undefined:\s*Sẵn sàng/i)).toHaveCount(0);
    await expect(page.getByText(/Nguồn hoạt động chính:\s*app-\d{4}-\d{2}-\d{2}\.log/i).first()).toBeVisible();
    await expect(page.locator('.ant-tag').filter({ hasText: /^Debug$/i }).first()).toBeVisible();

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

  test('opens the first-profile creation flow from the dashboard when no profiles exist', async ({ page, request }) => {
    await deleteAllProfiles(request);
    await setOnboardingCompleted(request, true);

    await gotoDashboard(page);
    await page.getByRole('button', { name: /t.+o h.+ s.+ .+u ti.+n/i }).first().click();

    await expect(page).toHaveURL(/\/ui\/profiles$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/t.+n h.+ s.+/i);
  });
});

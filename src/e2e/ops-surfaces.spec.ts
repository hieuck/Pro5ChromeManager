import { expect, test, type Page } from '@playwright/test';

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
});

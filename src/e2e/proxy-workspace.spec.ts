import { expect, test } from '@playwright/test';

test.describe('Proxy workspace', () => {
  test('opens the proxy creation flow from the proxy workspace', async ({ page }) => {
    await page.goto('/ui/proxies');
    await expect(page.getByRole('heading', { name: 'Trung tâm proxy' })).toBeVisible();
    await expect(page.getByText('Import hàng loạt')).toBeVisible();

    await page.getByRole('button', { name: 'Thêm proxy' }).click();
    const dialog = page.getByRole('dialog', { name: 'Thêm proxy' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Host')).toBeVisible();
    await expect(dialog.getByLabel('Port')).toBeVisible();
    await expect(dialog.getByLabel('Xác thực')).toBeVisible();
    await expect(dialog.getByLabel('Password')).toBeVisible();

    await dialog.getByRole('button', { name: 'Hủy' }).click();
    await expect(dialog).toBeHidden();
  });
});

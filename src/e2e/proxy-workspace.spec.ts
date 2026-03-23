import { expect, test } from '@playwright/test';

test.describe('Proxy workspace', () => {
  test('creates a proxy from the proxy workspace', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;

    await page.goto('/ui/proxies');
    await expect(page.getByRole('heading', { name: 'Trung tâm proxy' })).toBeVisible();
    await expect(page.getByText('Import hàng loạt')).toBeVisible();

    await page.getByRole('button', { name: 'Thêm proxy' }).click();
    const dialog = page.getByRole('dialog', { name: 'Thêm proxy' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Host').fill(uniqueHost);
    await dialog.getByLabel('Port').fill('8080');
    await dialog.getByLabel('Xác thực').fill('demo-user');
    await dialog.getByLabel('Password').fill('demo-pass');

    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText(uniqueHost)).toBeVisible();
    await expect(page.getByText('demo-user')).toBeVisible();
    await expect(page.getByText(':8080')).toBeVisible();
  });

  test('imports proxies in bulk from the proxy workspace', async ({ page }) => {
    const firstHost = `198.51.100.${Math.floor(Math.random() * 100) + 100}`;
    const secondHost = `198.51.100.${Math.floor(Math.random() * 100) + 200}`;

    await page.goto('/ui/proxies');
    await expect(page.getByRole('heading', { name: 'Trung tâm proxy' })).toBeVisible();

    await page.getByPlaceholder('Mỗi dòng một proxy, ví dụ:\n10.0.0.1:8080\n10.0.0.2:9000:user:pass\nsocks5://alice:secret@10.0.0.3:1080').fill(
      `${firstHost}:9001\n${secondHost}:9002:bulk-user:bulk-pass`,
    );
    await page.getByRole('button', { name: 'Import proxy' }).click();

    await expect(page.getByText(firstHost)).toBeVisible();
    await expect(page.getByText(secondHost)).toBeVisible();
    await expect(page.getByText('bulk-user')).toBeVisible();
    await expect(page.getByText(':9001')).toBeVisible();
    await expect(page.getByText(':9002')).toBeVisible();
  });
});

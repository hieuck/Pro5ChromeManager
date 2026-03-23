import { expect, test, type Page } from '@playwright/test';

async function gotoProxyWorkspace(page: Page): Promise<void> {
  await page.goto('/ui/proxies');
  await expect(page).toHaveURL(/\/ui\/proxies$/);
  await expect(page.locator('main h3')).toContainText(/proxy/i);
  await expect(page.getByRole('button', { name: 'Import proxy' })).toBeVisible();
}

async function openCreateProxyDialog(page: Page): Promise<void> {
  await page.locator('main').getByRole('button', { name: /proxy/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function getBulkInput(page: Page) {
  return page.getByPlaceholder(/10\.0\.0\.1:8080/);
}

test.describe('Proxy workspace', () => {
  test('creates a proxy from the proxy workspace', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;

    await gotoProxyWorkspace(page);
    await openCreateProxyDialog(page);

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Host').fill(uniqueHost);
    await dialog.getByLabel('Port').fill('8080');
    await dialog.getByLabel(/x.+c/i).fill('demo-user');
    await dialog.getByLabel('Password').fill('demo-pass');

    await dialog.getByRole('button', { name: /l.+u/i }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText(uniqueHost)).toBeVisible();
    await expect(page.getByText('demo-user')).toBeVisible();
    await expect(page.getByText(':8080')).toBeVisible();
  });

  test('imports proxies in bulk from the proxy workspace', async ({ page }) => {
    const firstHost = `198.51.100.${Math.floor(Math.random() * 100) + 100}`;
    const secondHost = `198.51.100.${Math.floor(Math.random() * 100) + 200}`;

    await gotoProxyWorkspace(page);

    const bulkInput = await getBulkInput(page);
    await bulkInput.fill(`${firstHost}:9001\n${secondHost}:9002:bulk-user:bulk-pass`);
    await page.getByRole('button', { name: 'Import proxy' }).click();

    await expect(page.getByText(firstHost)).toBeVisible();
    await expect(page.getByText(secondHost)).toBeVisible();
    await expect(page.getByText('bulk-user')).toBeVisible();
    await expect(page.getByText(':9001')).toBeVisible();
    await expect(page.getByText(':9002')).toBeVisible();
  });

  test('applies the selected default type during bulk import', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 40) + 210}`;

    await gotoProxyWorkspace(page);

    await page.locator('.ant-select').first().click();
    await page.locator('.ant-select-dropdown').getByText('SOCKS5').click();

    const bulkInput = await getBulkInput(page);
    await bulkInput.fill(`${uniqueHost}:1080`);
    await page.getByRole('button', { name: 'Import proxy' }).click();

    const row = page.getByRole('row', { name: new RegExp(`${uniqueHost.replaceAll('.', '\\.')}.*:1080`) });
    await expect(row).toBeVisible();
    await expect(row.getByText('SOCKS5')).toBeVisible();
    await expect(page.getByText(':1080')).toBeVisible();
  });

  test('skips duplicate proxies during bulk import', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 40) + 10}`;
    const proxyLine = `${uniqueHost}:9100:repeat-user:repeat-pass`;

    await gotoProxyWorkspace(page);

    const bulkInput = await getBulkInput(page);
    await bulkInput.fill(proxyLine);
    await page.getByRole('button', { name: 'Import proxy' }).click();

    const row = page.getByRole('row', { name: new RegExp(uniqueHost.replaceAll('.', '\\.')) });
    await expect(row).toHaveCount(1);

    await bulkInput.fill(proxyLine);
    await page.getByRole('button', { name: 'Import proxy' }).click();

    await expect(page.getByRole('row', { name: new RegExp(uniqueHost.replaceAll('.', '\\.')) })).toHaveCount(1);
    await expect(page.getByText('repeat-user')).toHaveCount(1);
    await expect(page.getByText(':9100')).toHaveCount(1);
  });

  test('deletes a proxy from the proxy workspace', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 100) + 50}`;

    await gotoProxyWorkspace(page);
    await openCreateProxyDialog(page);

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Host').fill(uniqueHost);
    await dialog.getByLabel('Port').fill('8111');
    await dialog.getByRole('button', { name: /l.+u/i }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole('row', { name: new RegExp(uniqueHost.replaceAll('.', '\\.')) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'delete' }).click();

    const confirm = page.locator('.ant-popconfirm');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /c.+/i }).click();

    await expect(page.getByText(uniqueHost)).toHaveCount(0);
  });
});

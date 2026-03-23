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

function proxyRow(page: Page, host: string, port?: number) {
  const escapedHost = host.replaceAll('.', '\\.');
  const pattern = port ? new RegExp(`${escapedHost}\\s*: ?${port}`) : new RegExp(`${escapedHost}\\b`);
  return page.locator('tbody tr').filter({ hasText: pattern });
}

async function importProxyLines(page: Page, text: string): Promise<void> {
  const bulkInput = await getBulkInput(page);
  const importButton = page.getByRole('button', { name: 'Import proxy' });

  await bulkInput.fill(text);
  await importButton.click();
  await expect(importButton).not.toHaveClass(/ant-btn-loading/);
}

async function goToLastProxyPage(page: Page): Promise<void> {
  const pageItems = page.locator('.ant-pagination-item');
  const count = await pageItems.count();
  if (count > 1) {
    const lastPage = pageItems.nth(count - 1);
    const label = (await lastPage.textContent())?.trim() ?? String(count);
    await lastPage.click();
    await expect(page.locator('.ant-pagination-item-active')).toHaveText(label);
  }
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
    await goToLastProxyPage(page);

    await expect(page.getByText(uniqueHost)).toBeVisible();
    await expect(page.getByText('demo-user')).toBeVisible();
    await expect(page.getByText(':8080')).toBeVisible();
  });

  test('imports proxies in bulk from the proxy workspace', async ({ page }) => {
    const firstHost = `198.51.100.${Math.floor(Math.random() * 100) + 100}`;
    const secondHost = `198.51.100.${Math.floor(Math.random() * 100) + 200}`;

    await gotoProxyWorkspace(page);

    await importProxyLines(page, `${firstHost}:9001\n${secondHost}:9002:bulk-user:bulk-pass`);
    await goToLastProxyPage(page);

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

    await importProxyLines(page, `${uniqueHost}:1080`);
    await goToLastProxyPage(page);

    const row = proxyRow(page, uniqueHost, 1080);
    await expect(row).toBeVisible();
    await expect(row.getByText('SOCKS5')).toBeVisible();
    await expect(page.getByText(':1080')).toBeVisible();
  });

  test('shows bulk actions after selecting multiple proxies', async ({ page }) => {
    const firstHost = `198.51.100.${Math.floor(Math.random() * 40) + 60}`;
    const secondHost = `198.51.100.${Math.floor(Math.random() * 40) + 120}`;

    await gotoProxyWorkspace(page);

    await importProxyLines(page, `${firstHost}:9201\n${secondHost}:9202`);
    await goToLastProxyPage(page);

    const firstRow = proxyRow(page, firstHost, 9201);
    const secondRow = proxyRow(page, secondHost, 9202);

    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();

    await firstRow.getByRole('checkbox').check();
    await secondRow.getByRole('checkbox').check();

    await expect(page.locator('.ant-card-body').getByText(/2 proxy/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /test.+ch.+n/i })).toBeVisible();
  });

  test('hides bulk actions after clearing the selection', async ({ page }) => {
    const firstHost = `198.51.100.${Math.floor(Math.random() * 40) + 160}`;
    const secondHost = `198.51.100.${Math.floor(Math.random() * 40) + 220}`;

    await gotoProxyWorkspace(page);

    await importProxyLines(page, `${firstHost}:9301\n${secondHost}:9302`);
    await goToLastProxyPage(page);

    const firstRow = proxyRow(page, firstHost, 9301);
    const secondRow = proxyRow(page, secondHost, 9302);
    const bulkAction = page.getByRole('button', { name: /test.+ch.+n/i });

    await firstRow.getByRole('checkbox').check();
    await secondRow.getByRole('checkbox').check();

    await expect(bulkAction).toBeVisible();

    await firstRow.getByRole('checkbox').uncheck();
    await secondRow.getByRole('checkbox').uncheck();

    await expect(bulkAction).toHaveCount(0);
    await expect(page.locator('.ant-card-body').getByText(/2 proxy/i)).toHaveCount(0);
  });

  test('toggles bulk actions from the header select-all checkbox', async ({ page }) => {
    const firstHost = `198.51.100.${Math.floor(Math.random() * 40) + 20}`;
    const secondHost = `198.51.100.${Math.floor(Math.random() * 40) + 240}`;

    await gotoProxyWorkspace(page);

    await importProxyLines(page, `${firstHost}:9401\n${secondHost}:9402`);
    await goToLastProxyPage(page);

    const firstRow = proxyRow(page, firstHost, 9401);
    const secondRow = proxyRow(page, secondHost, 9402);
    const selectAll = page.getByRole('checkbox', { name: 'Select all' });
    const bulkAction = page.getByRole('button', { name: /test.+ch.+n/i });

    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();

    await selectAll.check();
    await expect(bulkAction).toBeVisible();

    await selectAll.uncheck();
    await expect(bulkAction).toHaveCount(0);
  });

  test('skips duplicate proxies during bulk import', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 40) + 10}`;
    const proxyLine = `${uniqueHost}:9100:repeat-user:repeat-pass`;

    await gotoProxyWorkspace(page);

    await importProxyLines(page, proxyLine);
    await goToLastProxyPage(page);

    const row = proxyRow(page, uniqueHost, 9100);
    await expect(row).toHaveCount(1);

    await importProxyLines(page, proxyLine);
    await goToLastProxyPage(page);

    await expect(proxyRow(page, uniqueHost, 9100)).toHaveCount(1);
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
    await goToLastProxyPage(page);

    const row = proxyRow(page, uniqueHost, 8111);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'delete' }).click();

    const confirm = page.locator('.ant-popconfirm');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /c.+/i }).click();

    await expect(page.getByText(uniqueHost)).toHaveCount(0);
  });
});

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

async function listProxyHosts(page: Page): Promise<Array<{ host: string; port: number; username?: string }>> {
  return page.evaluate(async () => {
    const response = await fetch('/api/proxies');
    const json = await response.json() as {
      success: boolean;
      data: Array<{ host: string; port: number; username?: string }>;
    };
    return json.data;
  });
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
  test('closes the create proxy dialog without persisting changes on cancel', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 40) + 150}`;

    await gotoProxyWorkspace(page);
    const beforeCount = (await listProxyHosts(page)).length;
    await openCreateProxyDialog(page);

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Host').fill(uniqueHost);
    await dialog.getByLabel('Port').fill('9555');
    await dialog.getByRole('button', { name: /h.+y/i }).click();

    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await listProxyHosts(page)).length).toBe(beforeCount);
  });

  test('keeps a proxy when delete confirmation is cancelled', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 40) + 110}`;

    await gotoProxyWorkspace(page);
    await openCreateProxyDialog(page);

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Host').fill(uniqueHost);
    await dialog.getByLabel('Port').fill('9556');
    await dialog.getByRole('button', { name: /l.+u/i }).click();
    await expect(dialog).toBeHidden();
    await goToLastProxyPage(page);

    const row = proxyRow(page, uniqueHost, 9556);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'delete' }).click();

    const confirm = page.locator('.ant-popconfirm');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /kh.+ng|no/i }).click();

    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'delete' })).toBeVisible();
  });

  test('keeps the create proxy dialog open when required fields are missing', async ({ page }) => {
    await gotoProxyWorkspace(page);
    const beforeCount = (await listProxyHosts(page)).length;

    await openCreateProxyDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Host').fill(`198.51.100.${Math.floor(Math.random() * 40) + 130}`);
    await dialog.getByRole('button', { name: /l.+u/i }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Port')).toHaveAttribute('aria-invalid', 'true');
    await expect.poll(async () => (await listProxyHosts(page)).length).toBe(beforeCount);
  });

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

    const row = proxyRow(page, uniqueHost, 8080);
    await expect(row).toBeVisible();
    await expect(row.getByText('demo-user')).toBeVisible();
    await expect(row.getByText(':8080')).toBeVisible();
  });

  test('creates a proxy with a non-default type from the create dialog', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 40) + 200}`;

    await gotoProxyWorkspace(page);
    await openCreateProxyDialog(page);

    const dialog = page.getByRole('dialog');
    await dialog.locator('.ant-select').first().click();
    await page.locator('.ant-select-dropdown').getByText('SOCKS5').click();
    await dialog.getByLabel('Host').fill(uniqueHost);
    await dialog.getByLabel('Port').fill('1085');
    await dialog.getByRole('button', { name: /l.+u/i }).click();

    await expect(dialog).toBeHidden();
    await goToLastProxyPage(page);

    const row = proxyRow(page, uniqueHost, 1085);
    await expect(row).toBeVisible();
    await expect(row.getByText('SOCKS5')).toBeVisible();
  });

  test('imports proxies in bulk from the proxy workspace', async ({ page }) => {
    const firstHost = `198.51.100.${Math.floor(Math.random() * 100) + 100}`;
    const secondHost = `198.51.100.${Math.floor(Math.random() * 100) + 200}`;

    await gotoProxyWorkspace(page);

    await importProxyLines(page, `${firstHost}:9001\n${secondHost}:9002:bulk-user:bulk-pass`);
    await goToLastProxyPage(page);

    const firstRow = proxyRow(page, firstHost, 9001);
    const secondRow = proxyRow(page, secondHost, 9002);

    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();
    await expect(secondRow.getByText('bulk-user')).toBeVisible();
    await expect(firstRow.getByText(':9001')).toBeVisible();
    await expect(secondRow.getByText(':9002')).toBeVisible();
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
    await expect(row.getByText(':1080')).toBeVisible();
  });

  test('imports proxy URLs with scheme and credentials', async ({ page }) => {
    const uniqueHost = `198.51.100.${Math.floor(Math.random() * 40) + 170}`;

    await gotoProxyWorkspace(page);

    await importProxyLines(page, `socks5://url-user:url-pass@${uniqueHost}:1081`);
    await goToLastProxyPage(page);

    const row = proxyRow(page, uniqueHost, 1081);
    await expect(row).toBeVisible();
    await expect(row.getByText('SOCKS5')).toBeVisible();
    await expect(row.getByText('url-user')).toBeVisible();
    await expect(row.getByText(':1081')).toBeVisible();
  });

  test('ignores blank and comment lines during bulk import', async ({ page }) => {
    const firstHost = `198.51.100.${Math.floor(Math.random() * 40) + 30}`;
    const secondHost = `198.51.100.${Math.floor(Math.random() * 40) + 230}`;

    await gotoProxyWorkspace(page);

    await importProxyLines(
      page,
      `# imported from note\n\n${firstHost}:9701\n// keep this line ignored\n${secondHost}:9702:comment-user:comment-pass`,
    );
    await goToLastProxyPage(page);

    const firstRow = proxyRow(page, firstHost, 9701);
    const secondRow = proxyRow(page, secondHost, 9702);

    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();
    await expect(secondRow.getByText('comment-user')).toBeVisible();

    const proxies = await listProxyHosts(page);
    expect(proxies.filter((proxy) => proxy.host === firstHost && proxy.port === 9701)).toHaveLength(1);
    expect(proxies.filter((proxy) => proxy.host === secondHost && proxy.port === 9702)).toHaveLength(1);
  });

  test('shows bulk actions after selecting multiple proxies', async ({ page }) => {
    await gotoProxyWorkspace(page);
    const visibleRows = page.locator('tbody tr');
    const firstRow = visibleRows.nth(0);
    const secondRow = visibleRows.nth(1);

    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();

    await firstRow.getByRole('checkbox').check();
    await secondRow.getByRole('checkbox').check();

    await expect(page.locator('.ant-card-body').getByText(/2 proxy/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /test.+ch.+n/i })).toBeVisible();
  });

  test('hides bulk actions after clearing the selection', async ({ page }) => {
    await gotoProxyWorkspace(page);
    const visibleRows = page.locator('tbody tr');
    const firstRow = visibleRows.nth(0);
    const secondRow = visibleRows.nth(1);
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
    await gotoProxyWorkspace(page);
    const visibleRows = page.locator('tbody tr');
    const selectAll = page.getByRole('checkbox', { name: 'Select all' });
    const bulkAction = page.getByRole('button', { name: /test.+ch.+n/i });

    await expect(visibleRows.first()).toBeVisible();

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
    const afterFirstImport = await listProxyHosts(page);
    expect(afterFirstImport.filter((proxy) => proxy.host === uniqueHost && proxy.port === 9100)).toHaveLength(1);

    await importProxyLines(page, proxyLine);
    const afterSecondImport = await listProxyHosts(page);
    const duplicates = afterSecondImport.filter((proxy) => proxy.host === uniqueHost && proxy.port === 9100);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.username).toBe('repeat-user');
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

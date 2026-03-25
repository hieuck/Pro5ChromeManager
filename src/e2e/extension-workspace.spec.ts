import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { execFileSync } from 'child_process';
import { expect, test, type APIRequestContext } from '@playwright/test';

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
    data: Array<{ id: string }>;
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to list profiles');
  }

  await Promise.all(json.data.map(async (profile) => {
    const deleteResponse = await request.delete(`/api/profiles/${profile.id}`);
    const deleteJson = await deleteResponse.json() as { success: boolean; error?: string };
    if (!deleteJson.success) {
      throw new Error(deleteJson.error ?? `Failed to delete profile ${profile.id}`);
    }
  }));
}

async function deleteAllExtensions(request: APIRequestContext): Promise<void> {
  const response = await request.get('/api/extensions');
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: Array<{ id: string }>;
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to list extensions');
  }

  await Promise.all(json.data.map(async (extension) => {
    const deleteResponse = await request.delete(`/api/extensions/${extension.id}`);
    const deleteJson = await deleteResponse.json() as { success: boolean; error?: string };
    if (!deleteJson.success) {
      throw new Error(deleteJson.error ?? `Failed to delete extension ${extension.id}`);
    }
  }));
}

async function createZipFixture(): Promise<string> {
  const fixturePath = path.join(process.cwd(), 'src', 'e2e', 'fixtures', 'sample-extension');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-extension-zip-'));
  const zipPath = path.join(tmpDir, 'sample-extension.zip');
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -Path '${path.join(fixturePath, '*').replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: 'pipe' },
  );
  return zipPath;
}

async function createCrxFixture(): Promise<string> {
  const zipPath = await createZipFixture();
  const crxPath = zipPath.replace(/\.zip$/i, '.crx');
  const zipBytes = await fs.readFile(zipPath);
  const header = Buffer.alloc(16);
  header.write('Cr24', 0, 'ascii');
  header.writeUInt32LE(3, 4);
  header.writeUInt32LE(0, 8);
  header.writeUInt32LE(0, 12);
  await fs.writeFile(crxPath, Buffer.concat([header, zipBytes]));
  return crxPath;
}

test.describe('Extension workspace', () => {
  test('adds an extension from the workspace and assigns it to a profile', async ({ page, request }) => {
    await setOnboardingCompleted(request, true);
    await deleteAllProfiles(request);
    await deleteAllExtensions(request);

    const fixturePath = path.join(process.cwd(), 'src', 'e2e', 'fixtures', 'sample-extension');

    await page.goto('/ui/extensions');
    await expect(page).toHaveURL(/\/ui\/extensions$/);
    await expect(page.getByRole('heading', { level: 3 })).toContainText('Extension Center');
    await page.getByRole('button', { name: /thêm extension/i }).click();
    await page.getByLabel('Nguồn extension').fill(fixturePath);
    await page.getByRole('button', { name: /^lưu$/i }).click();

    await expect(page.getByText('Playwright Sample Extension')).toBeVisible();

    await page.goto('/ui/profiles');
    await expect(page).toHaveURL(/\/ui\/profiles$/);
    await page.getByRole('button', { name: /tạo hồ sơ mới/i }).click();
    await page.getByLabel('Tên hồ sơ').fill('Extension Enabled Profile');
    await page.getByRole('tab', { name: 'Tiện ích' }).click();
    await page.locator('.ant-form-item').filter({ hasText: 'Extensions gắn với hồ sơ' }).locator('.ant-select-selector').click();
    await page.getByTitle('Playwright Sample Extension · v0.0.1').click();
    await page.getByRole('button', { name: /^tạo$/i }).click();

    const profilesResponse = await request.get('/api/profiles');
    const profilesJson = await profilesResponse.json() as {
      success: boolean;
      data: Array<{ name: string; extensionIds: string[] }>;
      error?: string;
    };

    expect(profilesJson.success).toBe(true);
    expect(profilesJson.data.find((profile) => profile.name === 'Extension Enabled Profile')?.extensionIds.length).toBe(1);
  });

  test('marks an extension as default so new profiles inherit it automatically', async ({ page, request }) => {
    await setOnboardingCompleted(request, true);
    await deleteAllProfiles(request);
    await deleteAllExtensions(request);

    const fixturePath = path.join(process.cwd(), 'src', 'e2e', 'fixtures', 'sample-extension');

    await page.goto('/ui/extensions');
    await expect(page).toHaveURL(/\/ui\/extensions$/);
    await page.getByRole('button', { name: /thêm extension/i }).click();
    await page.getByLabel('Nhóm extension').fill('wallet');
    await page.getByLabel('Nguồn extension').fill(fixturePath);
    await page.getByRole('button', { name: /^lưu$/i }).click();

    await expect(page.getByText('Playwright Sample Extension')).toBeVisible();
    await page.locator('tr', { hasText: 'Playwright Sample Extension' }).locator('.ant-switch').nth(1).click();

    const createProfileRes = await request.post('/api/profiles', {
      data: {
        name: 'Inherited Extension Profile',
      },
    });
    const createProfileJson = await createProfileRes.json() as {
      success: boolean;
      data: { extensionIds: string[] };
      error?: string;
    };

    expect(createProfileJson.success).toBe(true);
    expect(createProfileJson.data.extensionIds.length).toBe(1);
  });

  test('imports a zip package from the workspace and keeps it manageable in extension center', async ({ page, request }) => {
    await setOnboardingCompleted(request, true);
    await deleteAllProfiles(request);
    await deleteAllExtensions(request);

    const zipPath = await createZipFixture();

    await page.goto('/ui/extensions');
    await page.getByRole('button', { name: /thêm extension/i }).click();
    await page.getByLabel('Nguồn extension').fill(zipPath);
    await page.getByRole('button', { name: /^lưu$/i }).click();

    await expect(page.getByText('Playwright Sample Extension')).toBeVisible();

    const extensionsResponse = await request.get('/api/extensions');
    const extensionsJson = await extensionsResponse.json() as {
      success: boolean;
      data: Array<{ sourcePath: string; entryPath: string }>;
      error?: string;
    };

    expect(extensionsJson.success).toBe(true);
    expect(extensionsJson.data[0]?.sourcePath).toBe(zipPath);
    expect(extensionsJson.data[0]?.entryPath).not.toBe(zipPath);
  });

  test('imports a crx package from the workspace and keeps it manageable in extension center', async ({ page, request }) => {
    await setOnboardingCompleted(request, true);
    await deleteAllProfiles(request);
    await deleteAllExtensions(request);

    const crxPath = await createCrxFixture();

    await page.goto('/ui/extensions');
    await page.getByRole('button', { name: /thêm extension/i }).click();
    await page.getByLabel('Nguồn extension').fill(crxPath);
    await page.getByRole('button', { name: /^lưu$/i }).click();

    await expect(page.getByText('Playwright Sample Extension')).toBeVisible();

    const extensionsResponse = await request.get('/api/extensions');
    const extensionsJson = await extensionsResponse.json() as {
      success: boolean;
      data: Array<{ sourcePath: string; entryPath: string }>;
      error?: string;
    };

    expect(extensionsJson.success).toBe(true);
    expect(extensionsJson.data[0]?.sourcePath).toBe(crxPath);
    expect(extensionsJson.data[0]?.entryPath).not.toBe(crxPath);
  });

  test('imports a Chrome Web Store extension from an extension id and keeps it manageable in extension center', async ({ page, request }) => {
    await setOnboardingCompleted(request, true);
    await deleteAllProfiles(request);
    await deleteAllExtensions(request);

    await page.goto('/ui/extensions');
    await page.getByRole('button', { name: /thêm extension/i }).click();
    await page.getByLabel('Nguồn extension').fill('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await page.getByRole('button', { name: /^lưu$/i }).click();

    await expect(page.getByText('Playwright Sample Extension')).toBeVisible();

    const extensionsResponse = await request.get('/api/extensions');
    const extensionsJson = await extensionsResponse.json() as {
      success: boolean;
      data: Array<{ sourcePath: string; entryPath: string }>;
      error?: string;
    };

    expect(extensionsJson.success).toBe(true);
    expect(extensionsJson.data[0]?.sourcePath).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(extensionsJson.data[0]?.entryPath).not.toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  test('applies extension bundles by category when creating a profile', async ({ page, request }) => {
    await setOnboardingCompleted(request, true);
    await deleteAllProfiles(request);
    await deleteAllExtensions(request);

    const fixturePath = path.join(process.cwd(), 'src', 'e2e', 'fixtures', 'sample-extension');
    const zipPath = await createZipFixture();

    await request.post('/api/extensions', {
      data: {
        sourcePath: fixturePath,
        name: 'Wallet Bundle Extension',
        category: 'wallet',
      },
    });
    await request.post('/api/extensions', {
      data: {
        sourcePath: zipPath,
        name: 'Automation Bundle Extension',
        category: 'automation',
      },
    });

    await page.goto('/ui/profiles');
    await page.getByRole('button', { name: /tạo hồ sơ mới/i }).click();
    await page.getByLabel('Tên hồ sơ').fill('Bundle Selected Profile');
    await page.getByRole('tab', { name: 'Tiện ích' }).click();
    await page.locator('.ant-form-item').filter({ hasText: 'Bundle theo use case' }).locator('.ant-select-selector').click();
    await page.getByTitle('wallet · 1 extension').click();
    await page.getByRole('button', { name: /^tạo$/i }).click();

    const profilesResponse = await request.get('/api/profiles');
    const profilesJson = await profilesResponse.json() as {
      success: boolean;
      data: Array<{ name: string; extensionIds: string[] }>;
      error?: string;
    };

    expect(profilesJson.success).toBe(true);
    expect(profilesJson.data.find((profile) => profile.name === 'Bundle Selected Profile')?.extensionIds.length).toBe(1);
  });
});

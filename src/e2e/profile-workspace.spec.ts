import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

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
  tags?: string[];
  owner?: string | null;
  runtime?: string;
  proxy?: { id: string } | null;
  extensionIds?: string[];
  bookmarks?: Array<{ name: string; url: string; folder?: string | null }>;
}

interface ExtensionRecord {
  id: string;
  name: string;
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

async function deleteAllProfiles(request: APIRequestContext): Promise<void> {
  const response = await request.get('/api/profiles');
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: ProfileRecord[];
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

  for (const extension of json.data) {
    const deleteResponse = await request.delete(`/api/extensions/${extension.id}`);
    const deleteJson = await deleteResponse.json() as { success: boolean; error?: string };
    if (!deleteJson.success) {
      throw new Error(deleteJson.error ?? `Failed to delete extension ${extension.id}`);
    }
  }
}

async function gotoProfileWorkspace(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/ui/profiles');
    await expect(page).toHaveURL(/\/ui\/profiles$/);

    const bodyText = await page.locator('body').textContent();
    if (bodyText?.includes('Internal server error') && attempt === 0) {
      await page.waitForTimeout(300);
      continue;
    }

    const createButton = page.getByRole('button', { name: /t.+o.+h.+ s.+/i });
    await expect(createButton).toBeVisible();
    return;
  }

  throw new Error('Profile workspace did not recover from a transient shell error');
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
  payload: {
    name: string;
    notes?: string;
    group?: string | null;
    runtime?: string;
    proxyId?: string | null;
    extensionIds?: string[];
  },
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

async function createExtensionViaApi(
  request: APIRequestContext,
  payload: { sourcePath: string; name?: string; category?: string | null },
): Promise<ExtensionRecord> {
  const response = await request.post('/api/extensions', { data: payload });
  const json = await response.json() as {
    success: boolean;
    error?: string;
    data: ExtensionRecord;
  };

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to create extension');
  }

  return json.data;
}

function profileRow(page: Page, name: string) {
  return page.locator('tbody tr').filter({ has: page.getByRole('button', { name }) });
}

async function openCreateProfileDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: /t.+o.+h.+ s.+/i }).click();
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
    await drawer.getByLabel(/t.+n h.+ s.+/i).fill(profileName);
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
    await expect(editDrawer.getByLabel(/t.+n h.+ s.+/i)).toHaveValue(profileName);
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
    await expect(drawer.getByLabel(/t.+n h.+ s.+/i)).toHaveValue(created.name);

    await drawer.getByLabel(/nh.+m/i).fill(updatedGroup);
    await drawer.getByLabel(/ghi ch.+/i).fill(updatedNotes);
    await drawer.getByRole('tabpanel', { name: /chung/i }).locator('.ant-select').nth(1).locator('.ant-select-selector').click();
    await page.locator('.ant-select-dropdown').getByText(/t.+ .+ng/i).click();

    await drawer.getByRole('button', { name: /l.+u/i }).click();
    await expect(drawer).toBeHidden();

    await expect(row.getByText(updatedGroup)).toBeVisible();

    await row.getByRole('button', { name: initialName }).click();
    const reopenedDrawer = page.getByRole('dialog');
    await expect(reopenedDrawer.getByLabel(/nh.+m/i)).toHaveValue(updatedGroup);
    await expect(reopenedDrawer.getByLabel(/ghi ch.+/i)).toHaveValue(updatedNotes);
    await expect(reopenedDrawer.getByRole('tabpanel', { name: /chung/i })).toContainText(/t.+ .+ng/i);
  });

  test('assigns one proxy to multiple selected profiles from the workspace', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const proxy = await createProxyViaApi(
      request,
      `203.0.113.${Math.floor(Math.random() * 30) + 20}`,
      8500,
      `Bulk Assign ${uniqueId}`,
    );
    const firstProfile = await createProfileViaApi(request, {
      name: `Bulk Proxy A ${uniqueId}`,
      runtime: 'e2e',
    });
    const secondProfile = await createProfileViaApi(request, {
      name: `Bulk Proxy B ${uniqueId}`,
      runtime: 'e2e',
    });

    await gotoProfileWorkspace(page);

    const firstRow = profileRow(page, firstProfile.name);
    const secondRow = profileRow(page, secondProfile.name);
    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();

    await firstRow.getByRole('checkbox').check();
    await secondRow.getByRole('checkbox').check();
    await expect(firstRow.getByRole('checkbox')).toBeChecked();
    await expect(secondRow.getByRole('checkbox')).toBeChecked();

    const bulkProxySelect = page.locator('.ant-select').filter({ hasText: /proxy/i }).last();
    await bulkProxySelect.locator('.ant-select-selector').click();
    await page.locator('.ant-select-dropdown').getByText(`${proxy.host}:${proxy.port}`).click();
    const applyProxyButton = page.getByRole('button', { name: /.+p d.+ng proxy/i });
    await expect(applyProxyButton).toBeEnabled();
    await applyProxyButton.click();
    await expect(applyProxyButton).not.toBeVisible();
    await expect(page.getByText(/Ä‘Ã£ chá»n 2|da chon 2/i)).toHaveCount(0);
    await expect(firstRow.getByText(`${proxy.host}:${proxy.port}`)).toBeVisible();
    await expect(secondRow.getByText(`${proxy.host}:${proxy.port}`)).toBeVisible();

    const profileListResponse = await request.get('/api/profiles');
    const profileListJson = await profileListResponse.json() as {
      success: boolean;
      data: ProfileRecord[];
    };
    expect(profileListJson.success).toBe(true);

    const persistedFirst = profileListJson.data.find((profile) => profile.name === firstProfile.name);
    const persistedSecond = profileListJson.data.find((profile) => profile.name === secondProfile.name);
    expect(persistedFirst?.name).toBe(firstProfile.name);
    expect(persistedSecond?.name).toBe(secondProfile.name);
    expect(persistedFirst?.proxy?.id).toBe(proxy.id);
    expect(persistedSecond?.proxy?.id).toBe(proxy.id);
  });

  test('updates group, owner, and runtime for many selected profiles from the workspace', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const firstProfile = await createProfileViaApi(request, {
      name: `Bulk Edit A ${uniqueId}`,
      runtime: 'auto',
    });
    const secondProfile = await createProfileViaApi(request, {
      name: `Bulk Edit B ${uniqueId}`,
      runtime: 'auto',
    });

    await gotoProfileWorkspace(page);

    const firstRow = profileRow(page, firstProfile.name);
    const secondRow = profileRow(page, secondProfile.name);
    await firstRow.getByRole('checkbox').check();
    await secondRow.getByRole('checkbox').check();
    await expect(firstRow.getByRole('checkbox')).toBeChecked();
    await expect(secondRow.getByRole('checkbox')).toBeChecked();

    await page.getByRole('button', { name: 'Sửa metadata' }).click();
    const modal = page.getByRole('dialog', { name: 'Sửa metadata hàng loạt' });
    await expect(modal).toBeVisible();
    await modal.getByPlaceholder('Nhóm mới').fill(`Batch Group ${uniqueId}`);
    await modal.getByPlaceholder('Owner mới').fill(`owner-${uniqueId}`);
    const runtimeSelect = modal.locator('.ant-select').first();
    await runtimeSelect.locator('.ant-select-selector').click();
    const runtimeDropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await expect(runtimeDropdown).toBeVisible();
    await runtimeDropdown.getByText('E2E Runtime').click();
    await expect(runtimeSelect).toContainText('E2E Runtime');
    await modal.locator('.ant-modal-footer .ant-btn-primary').click({ force: true });

    await expect.poll(async () => {
      const profilesResponse = await request.get('/api/profiles');
      const profilesJson = await profilesResponse.json() as { success: boolean; data: ProfileRecord[] };
      if (!profilesJson.success) {
        return false;
      }

      const persistedFirst = profilesJson.data.find((profile) => profile.name === firstProfile.name);
      const persistedSecond = profilesJson.data.find((profile) => profile.name === secondProfile.name);
      return persistedFirst?.group === `Batch Group ${uniqueId}`
        && persistedSecond?.owner === `owner-${uniqueId}`
        && persistedFirst?.runtime === 'e2e'
        && persistedSecond?.runtime === 'e2e';
    }).toBe(true);
  });

  test('applies extension bundles and manual extensions to many selected profiles from the workspace', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    await deleteAllExtensions(request);
    const walletExtension = await createExtensionViaApi(request, {
      sourcePath: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      name: `Wallet Bundle ${uniqueId}`,
      category: 'wallet',
    });
    const automationExtension = await createExtensionViaApi(request, {
      sourcePath: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      name: `Automation Stack ${uniqueId}`,
      category: 'automation',
    });
    const firstProfile = await createProfileViaApi(request, {
      name: `Bulk Extensions A ${uniqueId}`,
      runtime: 'e2e',
    });
    const secondProfile = await createProfileViaApi(request, {
      name: `Bulk Extensions B ${uniqueId}`,
      runtime: 'e2e',
      extensionIds: [walletExtension.id],
    });

    await gotoProfileWorkspace(page);
    await expect.poll(async () => {
      const extensionsResponse = await request.get('/api/extensions');
      const extensionsJson = await extensionsResponse.json() as { success: boolean; data: ExtensionRecord[] };
      return extensionsJson.success ? extensionsJson.data.length : 0;
    }).toBe(2);
    await page.reload();
    await page.waitForResponse((response) => response.url().includes('/api/extensions') && response.request().method() === 'GET');

    const firstRow = profileRow(page, firstProfile.name);
    const secondRow = profileRow(page, secondProfile.name);
    await firstRow.getByRole('checkbox').check();
    await secondRow.getByRole('checkbox').check();

    await page.getByRole('button', { name: 'Gán extension' }).click();
    const modal = page.getByRole('dialog', { name: 'Gán extension cho nhiều profile' });
    await expect(modal).toBeVisible();
    const bundleSelect = modal.locator('.ant-select').nth(0);
    await bundleSelect.locator('.ant-select-selector').click();
    await bundleSelect.locator('input').fill('wallet');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(bundleSelect).toContainText('wallet');

    const extensionSelect = modal.locator('.ant-select').nth(1);
    await extensionSelect.locator('.ant-select-selector').click({ force: true });
    const extensionDropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await expect(extensionDropdown).toBeVisible();
    const extensionOption = extensionDropdown.getByText(automationExtension.name);
    await extensionOption.scrollIntoViewIfNeeded();
    await extensionOption.click();
    await expect(extensionSelect).toContainText(automationExtension.name);
    await modal.getByRole('button', { name: 'Áp dụng' }).click();

    await expect.poll(async () => {
      const profilesResponse = await request.get('/api/profiles');
      const profilesJson = await profilesResponse.json() as { success: boolean; data: ProfileRecord[] };
      if (!profilesJson.success) {
        return false;
      }

      const persistedFirst = profilesJson.data.find((profile) => profile.name === firstProfile.name);
      const persistedSecond = profilesJson.data.find((profile) => profile.name === secondProfile.name);
      const firstHasAll = [walletExtension.id, automationExtension.id].every((id) => persistedFirst?.extensionIds?.includes(id));
      const secondHasAll = [walletExtension.id, automationExtension.id].every((id) => persistedSecond?.extensionIds?.includes(id));
      const deduped = new Set(persistedSecond?.extensionIds ?? []).size === (persistedSecond?.extensionIds ?? []).length;
      return firstHasAll && secondHasAll && deduped;
    }).toBe(true);
  });

  test('imports and clears cookies for a profile from the workspace drawer', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const profile = await createProfileViaApi(request, {
      name: `Cookie Profile ${uniqueId}`,
      runtime: 'e2e',
    });

    await gotoProfileWorkspace(page);
    const row = profileRow(page, profile.name);
    await row.getByRole('button', { name: profile.name }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('tab').last().click();
    await expect(drawer.getByRole('button', { name: /import cookies/i })).toBeVisible();

    await drawer.locator('textarea').last().fill(JSON.stringify([
      {
        name: 'session',
        value: `cookie-${uniqueId}`,
        domain: '.example.com',
        path: '/',
      },
    ], null, 2));
    await drawer.getByRole('button', { name: /import cookies/i }).click();
    await expect.poll(async () => {
      const cookiesRes = await request.get(`/api/profiles/${profile.id}/cookies`);
      const cookiesJson = await cookiesRes.json() as {
        success: boolean;
        data: { count: number; cookies: Array<{ name: string }> };
      };
      return cookiesJson.success ? cookiesJson.data.count : -1;
    }).toBe(1);

    const cookiesRes = await request.get(`/api/profiles/${profile.id}/cookies`);
    const cookiesJson = await cookiesRes.json() as {
      success: boolean;
      data: { count: number; cookies: Array<{ name: string }> };
    };
    expect(cookiesJson.success).toBe(true);
    expect(cookiesJson.data.count).toBe(1);
    expect(cookiesJson.data.cookies[0]?.name).toBe('session');

    await drawer.getByRole('button', { name: 'Xóa cookies' }).click();
    await expect.poll(async () => {
      const afterClearRes = await request.get(`/api/profiles/${profile.id}/cookies`);
      const afterClearJson = await afterClearRes.json() as {
        success: boolean;
        data: { count: number };
      };
      return afterClearJson.success ? afterClearJson.data.count : -1;
    }).toBe(0);
  });

  test('edits bookmarks for a profile from the workspace drawer', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const profile = await createProfileViaApi(request, {
      name: `Bookmark Profile ${uniqueId}`,
      runtime: 'e2e',
    });

    await gotoProfileWorkspace(page);
    const row = profileRow(page, profile.name);
    await row.getByRole('button', { name: profile.name }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('tab', { name: /bookmarks/i }).click();
    const bookmarksPanel = drawer.getByRole('tabpanel', { name: /bookmarks/i });
    await expect(bookmarksPanel).toBeVisible();

    await bookmarksPanel.locator('textarea').fill(JSON.stringify([
      {
        name: 'Workspace Docs',
        url: 'https://docs.example.com/',
        folder: 'Work',
      },
      {
        name: 'Google',
        url: 'https://www.google.com/',
        folder: null,
      },
    ], null, 2));
    await drawer.getByRole('button', { name: /l.+u/i }).click();
    await expect(drawer).toBeHidden();

    const persistedProfileRes = await request.get(`/api/profiles/${profile.id}`);
    const persistedProfileJson = await persistedProfileRes.json() as {
      success: boolean;
      data: ProfileRecord;
    };
    expect(persistedProfileJson.success).toBe(true);
    expect(persistedProfileJson.data.bookmarks).toEqual([
      {
        name: 'Workspace Docs',
        url: 'https://docs.example.com/',
        folder: 'Work',
      },
      {
        name: 'Google',
        url: 'https://www.google.com/',
        folder: null,
      },
    ]);
  });

  test('clones a profile from the workspace and preserves key metadata', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const original = await createProfileViaApi(request, {
      name: `Clone Source ${uniqueId}`,
      group: `Clone Group ${uniqueId}`,
      notes: `Clone notes ${uniqueId}`,
      runtime: 'e2e',
    });

    await gotoProfileWorkspace(page);

    const sourceRow = profileRow(page, original.name);
    await expect(sourceRow).toBeVisible();
    await sourceRow.getByRole('button').nth(3).click();

    const cloneName = `${original.name} Copy`;
    const cloneRow = profileRow(page, cloneName);
    await expect(cloneRow).toBeVisible();
    await expect(cloneRow).toContainText(original.group ?? '');

    await cloneRow.getByRole('button', { name: cloneName }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel(/t.+n h.+ s.+/i)).toHaveValue(cloneName);
    await expect(drawer.getByLabel(/nh.+m/i)).toHaveValue(original.group ?? '');
    await expect(drawer.getByLabel(/ghi ch.+/i)).toHaveValue(original.notes ?? '');
  });

  test('deletes a profile from the workspace after confirmation', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const profile = await createProfileViaApi(request, {
      name: `Delete Me ${uniqueId}`,
      runtime: 'e2e',
    });

    await gotoProfileWorkspace(page);

    const row = profileRow(page, profile.name);
    await expect(row).toBeVisible();
    await row.getByRole('button').nth(5).click();

    const confirm = page.locator('.ant-popconfirm');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /c.+|yes/i }).click();

    await expect(row).toHaveCount(0);

    const listResponse = await request.get('/api/profiles');
    const listJson = await listResponse.json() as {
      success: boolean;
      data: ProfileRecord[];
    };
    expect(listJson.success).toBe(true);
    expect(listJson.data.some((entry) => entry.id === profile.id)).toBe(false);
  });

  test('finds profiles by search terms across name, group, notes, tags, and owner', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const focusProfile = await createProfileViaApi(request, {
      name: `Focus Profile ${uniqueId}`,
      group: `Growth ${uniqueId}`,
      notes: `Needle note ${uniqueId}`,
      tags: [`needle-${uniqueId}`, 'priority'],
      owner: `owner-${uniqueId}`,
      runtime: 'e2e',
    });
    await createProfileViaApi(request, {
      name: `Background Profile ${uniqueId}`,
      group: `Support ${uniqueId}`,
      notes: `Background note ${uniqueId}`,
      tags: [`background-${uniqueId}`],
      runtime: 'e2e',
    });

    await gotoProfileWorkspace(page);

    const searchInput = page.getByPlaceholder(/t.+m ki.+m/i);
    await searchInput.fill(`needle-${uniqueId}`);
    await expect(profileRow(page, focusProfile.name)).toBeVisible();
    await expect(profileRow(page, `Background Profile ${uniqueId}`)).toHaveCount(0);

    await searchInput.clear();

    await searchInput.fill(`Growth ${uniqueId}`);
    await expect(profileRow(page, focusProfile.name)).toBeVisible();
    await expect(profileRow(page, `Background Profile ${uniqueId}`)).toHaveCount(0);

    await searchInput.clear();

    await searchInput.fill(`owner-${uniqueId}`);
    await expect(profileRow(page, focusProfile.name)).toBeVisible();
    await expect(profileRow(page, `Background Profile ${uniqueId}`)).toHaveCount(0);

    await searchInput.clear();

    await searchInput.fill(`needle-${uniqueId}`);
    await expect(profileRow(page, focusProfile.name)).toBeVisible();
    await expect(profileRow(page, `Background Profile ${uniqueId}`)).toHaveCount(0);
  });

  test('creates many profiles from pasted lines in the bulk create modal', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const proxy = await createProxyViaApi(request, '198.51.100.88', 8700, `Bulk UI ${uniqueId}`);

    await gotoProfileWorkspace(page);
    await page.getByRole('button', { name: 'Tạo hàng loạt' }).click();

    const modal = page.getByRole('dialog', { name: 'Tạo profile hàng loạt' });
    await expect(modal).toBeVisible();
    await modal.getByRole('textbox').first().fill([
      `Bulk UI Alpha ${uniqueId} | Growth | owner-a | warm,scale | Primary row`,
      `Bulk UI Beta ${uniqueId}`,
    ].join('\n'));
    await modal.locator('.ant-select').nth(0).locator('.ant-select-selector').click();
    await page.locator('.ant-select-dropdown').getByText('E2E Runtime').click();
    await modal.locator('.ant-select').nth(1).locator('.ant-select-selector').click();
    await page.locator('.ant-select-dropdown').getByText(`${proxy.host}:${proxy.port}`).click();
    await expect(modal.getByText('Preview hợp lệ: 2 profile')).toBeVisible();
    await modal.getByRole('button', { name: 'Tạo 2' }).click();

    await expect(profileRow(page, `Bulk UI Alpha ${uniqueId}`)).toBeVisible();
    await expect(profileRow(page, `Bulk UI Beta ${uniqueId}`)).toBeVisible();
    await expect(profileRow(page, `Bulk UI Alpha ${uniqueId}`)).toContainText('Growth');
    await expect(profileRow(page, `Bulk UI Alpha ${uniqueId}`)).toContainText(`${proxy.host}:${proxy.port}`);

    const profilesResponse = await request.get('/api/profiles');
    const profilesJson = await profilesResponse.json() as { success: boolean; data: ProfileRecord[] };
    expect(profilesJson.success).toBe(true);
    expect(profilesJson.data.filter((profile) => profile.name.includes(`Bulk UI`) && profile.name.includes(uniqueId))).toHaveLength(2);
    expect(profilesJson.data.find((profile) => profile.name === `Bulk UI Alpha ${uniqueId}`)?.runtime).toBe('e2e');
    expect(profilesJson.data.find((profile) => profile.name === `Bulk UI Alpha ${uniqueId}`)?.proxy?.id).toBe(proxy.id);
  });

  test('imports exported profile packages from the workspace', async ({ page, request }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await completeOnboardingViaApi(request);
    await deleteAllProfiles(request);
    const sourceProfile = await createProfileViaApi(request, {
      name: `Portable Source ${uniqueId}`,
      notes: `Package note ${uniqueId}`,
      group: `Portables ${uniqueId}`,
      runtime: 'e2e',
    });

    const cookieImportResponse = await request.post(`/api/profiles/${sourceProfile.id}/cookies/import`, {
      data: {
        cookies: [
          {
            name: 'session',
            value: `portable-${uniqueId}`,
            domain: '.example.com',
            path: '/',
            expires: null,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
          },
        ],
      },
    });
    const cookieImportJson = await cookieImportResponse.json() as { success: boolean; error?: string };
    expect(cookieImportJson.success).toBe(true);

    const exportResponse = await request.get(`/api/profiles/${sourceProfile.id}/export`);
    expect(exportResponse.ok()).toBe(true);
    const exportBytes = await exportResponse.body();
    const packagePath = path.join(os.tmpdir(), `pro5-import-${uniqueId}.zip`);
    await fs.writeFile(packagePath, exportBytes);

    try {
      await gotoProfileWorkspace(page);
      await page.getByRole('button', { name: 'Import package' }).click();

      const modal = page.getByRole('dialog', { name: 'Import profile package' });
      await expect(modal).toBeVisible();
      await modal.locator('input[type="file"]').setInputFiles(packagePath);
      await expect(modal.getByText(path.basename(packagePath))).toBeVisible();
      await modal.getByRole('button', { name: 'Import 1' }).click();

      await expect(modal).toBeHidden();
      await expect.poll(async () => {
        const profilesResponse = await request.get('/api/profiles');
        const profilesJson = await profilesResponse.json() as { success: boolean; data: ProfileRecord[] };
        if (!profilesJson.success) {
          return 0;
        }
        return profilesJson.data.filter((profile) => profile.name === sourceProfile.name).length;
      }).toBe(2);

      await page.reload();
      await expect(page.getByText('Hiển thị 2/2 hồ sơ')).toBeVisible();

      const profilesResponse = await request.get('/api/profiles');
      const profilesJson = await profilesResponse.json() as { success: boolean; data: ProfileRecord[] };
      expect(profilesJson.success).toBe(true);
      const importedProfiles = profilesJson.data.filter((profile) => profile.name === sourceProfile.name);
      expect(importedProfiles).toHaveLength(2);

      const importedProfile = importedProfiles.find((profile) => profile.id !== sourceProfile.id);
      expect(importedProfile?.group).toBe(`Portables ${uniqueId}`);
      expect(importedProfile?.notes).toBe(`Package note ${uniqueId}`);

      const importedCookiesResponse = await request.get(`/api/profiles/${importedProfile?.id}/cookies`);
      const importedCookiesJson = await importedCookiesResponse.json() as {
        success: boolean;
        data: { count: number; cookies: Array<{ name: string; value: string }> };
      };
      expect(importedCookiesJson.success).toBe(true);
      expect(importedCookiesJson.data.count).toBe(1);
      expect(importedCookiesJson.data.cookies[0]).toMatchObject({
        name: 'session',
        value: `portable-${uniqueId}`,
      });
    } finally {
      await fs.rm(packagePath, { force: true });
    }
  });
});


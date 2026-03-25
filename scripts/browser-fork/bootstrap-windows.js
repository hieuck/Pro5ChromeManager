const fs = require('fs/promises');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.join(repoRoot, '.browser-fork');
const chromiumRoot = path.join(workspaceRoot, 'chromium');
const srcRoot = path.join(chromiumRoot, 'src');
const patchesRoot = path.join(workspaceRoot, 'patches');
const statusPath = path.join(workspaceRoot, 'bootstrap-status.json');

async function main() {
  await fs.mkdir(srcRoot, { recursive: true });
  await fs.mkdir(patchesRoot, { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    chromiumRoot,
    srcRoot,
    patchesRoot,
    nextSteps: [
      'Install depot_tools and add it to PATH.',
      'Fetch Chromium source into .browser-fork/chromium/src.',
      'Run npm run browser-fork:gn to generate args.gn.',
      'Patch BrowserView / ToolbarView / LocationBarView for Pro5 profile chrome.',
      'Build chrome or mini_installer from out/Pro5.',
    ],
    commands: [
      'set PATH=%PATH%;C:\\src\\depot_tools',
      `cd /d "${chromiumRoot}"`,
      'fetch --nohooks chromium',
      `cd /d "${srcRoot}"`,
      'gclient sync',
      'gn gen out/Pro5',
      'autoninja -C out/Pro5 chrome',
    ],
  };

  await fs.writeFile(statusPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

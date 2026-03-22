const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const built = args.has('--built');

function exists(...parts) {
  return fs.existsSync(path.join(rootDir, ...parts));
}

function env(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

const checks = [
  {
    level: 'error',
    ok: exists('landing', 'index.html'),
    message: 'landing/index.html is missing.',
  },
  {
    level: 'error',
    ok: exists('landing', 'support.html'),
    message: 'landing/support.html is missing.',
  },
  {
    level: 'error',
    ok: exists('landing', 'privacy.html'),
    message: 'landing/privacy.html is missing.',
  },
  {
    level: 'error',
    ok: exists('landing', 'terms.html'),
    message: 'landing/terms.html is missing.',
  },
  {
    level: 'error',
    ok: exists('.github', 'ISSUE_TEMPLATE', 'support.yml'),
    message: '.github/ISSUE_TEMPLATE/support.yml is missing.',
  },
  {
    level: 'error',
    ok: exists('src', 'server', 'routes', 'support.ts'),
    message: 'src/server/routes/support.ts is missing.',
  },
  {
    level: 'error',
    ok: !strict || Boolean(env('PRO5_OFFLINE_SECRET')),
    message: 'PRO5_OFFLINE_SECRET is required for release builds.',
  },
  {
    level: 'warning',
    ok: Boolean(env('CSC_LINK')),
    message: 'CSC_LINK is not configured; Windows installers will be unsigned.',
  },
];

if (built) {
  checks.push(
    {
      level: 'error',
      ok: exists('dist', 'server', 'index.js'),
      message: 'dist/server/index.js is missing. Run npm run build first.',
    },
    {
      level: 'error',
      ok: exists('dist', 'electron-main', 'main.js'),
      message: 'dist/electron-main/main.js is missing. Run npm run build first.',
    },
    {
      level: 'error',
      ok: exists('dist', 'ui', 'index.html'),
      message: 'dist/ui/index.html is missing. Run npm run build first.',
    },
  );
}

const failures = [];
const warnings = [];

for (const check of checks) {
  if (check.ok) continue;
  if (check.level === 'error') failures.push(check.message);
  else warnings.push(check.message);
}

console.log('Release preflight report');
console.log(`- strict mode: ${strict ? 'on' : 'off'}`);
console.log(`- build artifact check: ${built ? 'on' : 'off'}`);

if (warnings.length > 0) {
  console.log('- warnings:');
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('- failures:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('- status: ok');

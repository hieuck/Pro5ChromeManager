#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname.includes(path.sep)
  ? path.join(__dirname, '..')
  : path.resolve(__dirname, '..');

const BUILD_OUTPUTS = [
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
];

for (const relativeTarget of BUILD_OUTPUTS) {
  const targetPath = path.join(ROOT, relativeTarget);
  if (!fs.existsSync(targetPath)) {
    continue;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  console.log(`Removed ${relativeTarget}`);
}

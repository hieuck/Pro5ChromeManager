#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WORKSPACE_OUTPUTS = [
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  'tmp',
  'data-e2e-test',
];

for (const relativeTarget of WORKSPACE_OUTPUTS) {
  const targetPath = path.join(ROOT, relativeTarget);
  if (!fs.existsSync(targetPath)) {
    continue;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  console.log(`Removed ${relativeTarget}`);
}

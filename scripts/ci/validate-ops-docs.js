#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, readText, toPosixPath } = require('./_shared');

const REQUIRED_DOCS = [
  'docs/OPERATIONAL_RUNBOOKS.md',
  'docs/POST_DEPLOYMENT_REVIEW.md',
  'docs/localization.md',
  'SECURITY.md',
];

const violations = [];

for (const relativePath of REQUIRED_DOCS) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    violations.push(`${relativePath} is missing`);
    continue;
  }

  const content = readText(absolutePath).trim();
  if (content.length === 0) {
    violations.push(`${relativePath} is empty`);
    continue;
  }

  if (!/^#\s+/m.test(content)) {
    violations.push(`${relativePath} does not contain a top-level markdown heading`);
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`ERROR: ${violation}`);
  }
  process.exit(1);
}

console.log(`Validated operational docs: ${REQUIRED_DOCS.map(toPosixPath).join(', ')}`);

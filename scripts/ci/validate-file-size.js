#!/usr/bin/env node
'use strict';

const path = require('path');
const { ROOT, readText, toPosixPath, walkFiles } = require('./_shared');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sh']);

function getMaxLines(relativePath) {
  if (/\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/i.test(relativePath)) {
    return 6000;
  }

  if (relativePath.startsWith('src/ui/i18n/')) {
    return 1200;
  }

  if (relativePath.startsWith('src/e2e/')) {
    return 900;
  }

  if (relativePath.startsWith('scripts/')) {
    return 1300;
  }

  return 800;
}

const TARGET_DIRECTORIES = ['src', 'scripts', 'tests'];

const files = TARGET_DIRECTORIES.flatMap((relativeDirectory) => (
  walkFiles(path.join(ROOT, relativeDirectory), {
    fileFilter: (filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath)),
  })
));

const violations = [];

for (const filePath of files) {
  const relativePath = toPosixPath(path.relative(ROOT, filePath));
  const lineCount = readText(filePath).split(/\r?\n/).length;
  const maxLines = getMaxLines(relativePath);

  if (lineCount > maxLines) {
    violations.push({ relativePath, lineCount, maxLines });
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`ERROR: ${violation.relativePath} has ${violation.lineCount} lines (max ${violation.maxLines})`);
  }
  process.exit(1);
}

console.log(`Validated file size limits across ${files.length} source files`);

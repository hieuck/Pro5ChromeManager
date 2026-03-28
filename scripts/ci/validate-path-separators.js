#!/usr/bin/env node
'use strict';

const path = require('path');
const { ROOT, readText, toPosixPath, walkFiles } = require('./_shared');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const IMPORT_PATTERNS = [
  /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"`]([^'"`]+)['"`]/g,
  /\brequire\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /\bimport\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
];

const files = walkFiles(ROOT, {
  fileFilter: (filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath)),
});

const violations = [];

for (const filePath of files) {
  const content = readText(filePath);

  for (const pattern of IMPORT_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier || !specifier.includes('\\')) {
        continue;
      }

      violations.push({
        file: toPosixPath(path.relative(ROOT, filePath)),
        specifier,
      });
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`ERROR: backslash path separator in import specifier "${violation.specifier}" (${violation.file})`);
  }
  process.exit(1);
}

console.log(`Validated path separators in ${files.length} source files`);

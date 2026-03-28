'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const DEFAULT_IGNORES = new Set([
  '.git',
  'node_modules',
  'coverage',
  'dist',
  'playwright-report',
  'test-results',
]);

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function walkFiles(directory, options = {}) {
  const {
    ignoreDirs = DEFAULT_IGNORES,
    fileFilter = () => true,
  } = options;

  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath, options));
      continue;
    }

    if (entry.isFile() && fileFilter(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

module.exports = {
  ROOT,
  readText,
  toPosixPath,
  walkFiles,
};

#!/usr/bin/env node
'use strict';

const path = require('path');
const { ROOT, readText, toPosixPath, walkFiles } = require('./_shared');

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.toml',
  '.env',
  '.sh',
]);

const HIGH_SIGNAL_PATTERNS = [
  { label: 'OpenAI key', pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { label: 'GitHub classic token', pattern: /\bghp_[A-Za-z0-9]{36,}\b/g },
  { label: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { label: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'Private key block', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |)?PRIVATE KEY-----/g },
];

const GENERIC_ASSIGNMENT_PATTERN = {
  label: 'Hardcoded credential assignment',
  pattern: /\b(?:api[_-]?key|secret|password|token)\b\s*[:=]\s*['"][^'"\r\n]{16,}['"]/gi,
};

const TARGET_DIRECTORIES = ['src', 'scripts', 'tests'];
const ALLOWLIST = new Set([
  'tests/hooks/governance-capture.test.js',
]);

const files = TARGET_DIRECTORIES.flatMap((relativeDirectory) => (
  walkFiles(path.join(ROOT, relativeDirectory), {
    fileFilter: (filePath) => TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
  })
));

const violations = [];

for (const filePath of files) {
  const relativePath = toPosixPath(path.relative(ROOT, filePath));
  if (ALLOWLIST.has(relativePath)) {
    continue;
  }

  const content = readText(filePath);

  for (const { label, pattern } of HIGH_SIGNAL_PATTERNS) {
    pattern.lastIndex = 0;
    if (!pattern.test(content)) {
      continue;
    }

    violations.push({
      file: relativePath,
      label,
    });
    break;
  }

  if (violations.at(-1)?.file === relativePath) {
    continue;
  }

  const isTestFile = /\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/i.test(relativePath);
  if (isTestFile) {
    continue;
  }

  GENERIC_ASSIGNMENT_PATTERN.pattern.lastIndex = 0;
  if (GENERIC_ASSIGNMENT_PATTERN.pattern.test(content)) {
    violations.push({
      file: relativePath,
      label: GENERIC_ASSIGNMENT_PATTERN.label,
    });
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`ERROR: ${violation.label} detected in ${violation.file}`);
  }
  process.exit(1);
}

console.log(`Validated ${files.length} text files for hardcoded secrets`);

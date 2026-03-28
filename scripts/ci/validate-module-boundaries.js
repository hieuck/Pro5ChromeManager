#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, readText, toPosixPath, walkFiles } = require('./_shared');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const IMPORT_PATTERNS = [
  /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"`]([^'"`]+)['"`]/g,
  /\brequire\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /\bimport\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
];

const REALM_PREFIXES = {
  shared: 'src/shared/',
  ui: 'src/ui/',
  server: 'src/server/',
  electron: 'src/electron/',
};

const ALLOWED_IMPORTS = {
  shared: new Set(['shared']),
  ui: new Set(['ui', 'shared']),
  server: new Set(['server', 'shared']),
  electron: new Set(['electron', 'server', 'shared']),
};

function getRealm(relativePath) {
  if (/\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/i.test(relativePath) || relativePath.startsWith('src/e2e/')) {
    return null;
  }

  return Object.entries(REALM_PREFIXES).find(([, prefix]) => relativePath.startsWith(prefix))?.[0] ?? null;
}

function resolveImport(sourceFile, specifier) {
  const candidateBase = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    candidateBase,
    ...SOURCE_EXTENSIONS.map((extension) => `${candidateBase}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(candidateBase, `index${extension}`)),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

const files = walkFiles(path.join(ROOT, 'src'), {
  fileFilter: (filePath) => SOURCE_EXTENSIONS.includes(path.extname(filePath)),
});

const violations = [];

for (const filePath of files) {
  const sourceRelativePath = toPosixPath(path.relative(ROOT, filePath));
  const sourceRealm = getRealm(sourceRelativePath);

  if (!sourceRealm) {
    continue;
  }

  const content = readText(filePath);

  for (const pattern of IMPORT_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier || !specifier.startsWith('.')) {
        continue;
      }

      const resolvedPath = resolveImport(filePath, specifier);
      if (!resolvedPath) {
        continue;
      }

      const targetRelativePath = toPosixPath(path.relative(ROOT, resolvedPath));
      const targetRealm = getRealm(targetRelativePath);
      if (!targetRealm) {
        continue;
      }

      if (ALLOWED_IMPORTS[sourceRealm]?.has(targetRealm)) {
        continue;
      }

      violations.push({
        sourceRelativePath,
        specifier,
        targetRelativePath,
        sourceRealm,
        targetRealm,
      });
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(
      `ERROR: ${violation.sourceRelativePath} (${violation.sourceRealm}) cannot import ${violation.specifier} -> ${violation.targetRelativePath} (${violation.targetRealm})`,
    );
  }
  process.exit(1);
}

console.log(`Validated module boundaries across ${files.length} source files`);

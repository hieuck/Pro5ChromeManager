const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GENERATED_FILES = new Set(['RELEASE_MANIFEST.json', 'SHA256SUMS.txt']);

function parseArgs(argv) {
  const args = {
    dir: path.resolve('dist', 'electron'),
    verify: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir' && argv[i + 1]) {
      args.dir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--verify') {
      args.verify = true;
    }
  }

  return args;
}

function sha256ForFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function listArtifacts(outputDir) {
  return fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !GENERATED_FILES.has(name))
    .sort((a, b) => a.localeCompare(b));
}

function buildManifest(outputDir, packageJson) {
  const artifacts = listArtifacts(outputDir).map((name) => {
    const absolutePath = path.join(outputDir, name);
    const stats = fs.statSync(absolutePath);

    return {
      name,
      sizeBytes: stats.size,
      sha256: sha256ForFile(absolutePath),
      modifiedAt: stats.mtime.toISOString(),
    };
  });

  if (artifacts.length === 0) {
    throw new Error(`No release artifacts found in ${outputDir}`);
  }

  return {
    productName: 'Pro5 Chrome Manager',
    packageName: packageJson.name,
    version: packageJson.version,
    generatedAt: new Date().toISOString(),
    artifactDirectory: path.relative(process.cwd(), outputDir).replace(/\\/g, '/'),
    artifacts,
  };
}

function writeArtifacts(outputDir, manifest) {
  const manifestPath = path.join(outputDir, 'RELEASE_MANIFEST.json');
  const checksumsPath = path.join(outputDir, 'SHA256SUMS.txt');
  const checksumLines = manifest.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`);

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(checksumsPath, `${checksumLines.join('\n')}\n`, 'utf8');

  return { manifestPath, checksumsPath };
}

function parseChecksums(raw) {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
      if (!match) {
        throw new Error(`Invalid checksum line: ${line}`);
      }
      return {
        name: match[2],
        sha256: match[1].toLowerCase(),
      };
    });
}

function verifyArtifacts(outputDir) {
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Artifact directory not found: ${outputDir}`);
  }

  const manifestPath = path.join(outputDir, 'RELEASE_MANIFEST.json');
  const checksumsPath = path.join(outputDir, 'SHA256SUMS.txt');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing release manifest: ${manifestPath}`);
  }
  if (!fs.existsSync(checksumsPath)) {
    throw new Error(`Missing checksum file: ${checksumsPath}`);
  }

  const actualArtifacts = listArtifacts(outputDir);
  if (actualArtifacts.length === 0) {
    throw new Error(`No release artifacts found in ${outputDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestArtifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : null;
  if (!manifestArtifacts) {
    throw new Error('Release manifest is missing the artifacts array.');
  }

  const manifestNames = manifestArtifacts.map((artifact) => artifact.name).sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(manifestNames) !== JSON.stringify(actualArtifacts)) {
    throw new Error('Release manifest does not match the packaged artifact list.');
  }

  const checksumEntries = parseChecksums(fs.readFileSync(checksumsPath, 'utf8'));
  const checksumNames = checksumEntries.map((artifact) => artifact.name).sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(checksumNames) !== JSON.stringify(actualArtifacts)) {
    throw new Error('SHA256SUMS.txt does not match the packaged artifact list.');
  }

  for (const artifactName of actualArtifacts) {
    const absolutePath = path.join(outputDir, artifactName);
    const expectedSha = sha256ForFile(absolutePath);
    const expectedSize = fs.statSync(absolutePath).size;
    const manifestEntry = manifestArtifacts.find((entry) => entry.name === artifactName);
    const checksumEntry = checksumEntries.find((entry) => entry.name === artifactName);

    if (!manifestEntry) {
      throw new Error(`Artifact ${artifactName} is missing from RELEASE_MANIFEST.json.`);
    }
    if (!checksumEntry) {
      throw new Error(`Artifact ${artifactName} is missing from SHA256SUMS.txt.`);
    }
    if (manifestEntry.sha256 !== expectedSha) {
      throw new Error(`Manifest checksum mismatch for ${artifactName}.`);
    }
    if (checksumEntry.sha256 !== expectedSha) {
      throw new Error(`Checksum file mismatch for ${artifactName}.`);
    }
    if (manifestEntry.sizeBytes !== expectedSize) {
      throw new Error(`Manifest size mismatch for ${artifactName}.`);
    }
  }

  return actualArtifacts.length;
}

function main(argv = process.argv.slice(2)) {
  const { dir, verify } = parseArgs(argv);
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

  if (verify) {
    const verifiedCount = verifyArtifacts(dir);
    console.log(`Verified ${verifiedCount} release artifact(s) in ${path.relative(process.cwd(), dir) || dir}`);
    return;
  }

  if (!fs.existsSync(dir)) {
    throw new Error(`Artifact directory not found: ${dir}`);
  }

  const manifest = buildManifest(dir, packageJson);
  const { manifestPath, checksumsPath } = writeArtifacts(dir, manifest);

  console.log(`Generated ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`Generated ${path.relative(process.cwd(), checksumsPath)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[release-artifacts] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  GENERATED_FILES,
  buildManifest,
  listArtifacts,
  main,
  parseChecksums,
  parseArgs,
  sha256ForFile,
  verifyArtifacts,
  writeArtifacts,
};

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    input: '',
    output: path.resolve('dist', 'browser-cores'),
    key: 'pro5-chromium',
    label: 'Pro5 Chromium',
    version: process.env['npm_package_version'] || '1.0.0',
    executable: '',
    channel: 'preview',
    platform: 'win32',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      args.input = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--output' && argv[i + 1]) {
      args.output = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--key' && argv[i + 1]) {
      args.key = argv[i + 1];
      i += 1;
    } else if (arg === '--label' && argv[i + 1]) {
      args.label = argv[i + 1];
      i += 1;
    } else if (arg === '--version' && argv[i + 1]) {
      args.version = argv[i + 1];
      i += 1;
    } else if (arg === '--executable' && argv[i + 1]) {
      args.executable = argv[i + 1];
      i += 1;
    } else if (arg === '--channel' && argv[i + 1]) {
      args.channel = argv[i + 1];
      i += 1;
    } else if (arg === '--platform' && argv[i + 1]) {
      args.platform = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function ensureValidArgs(args) {
  if (!args.input) {
    throw new Error('Missing required --input path');
  }
  if (!fs.existsSync(args.input) || !fs.statSync(args.input).isDirectory()) {
    throw new Error(`Browser core input directory not found: ${args.input}`);
  }
  if (!args.executable) {
    throw new Error('Missing required --executable relative path');
  }

  const executableAbsolute = path.join(args.input, args.executable);
  if (!fs.existsSync(executableAbsolute)) {
    throw new Error(`Executable not found inside input directory: ${executableAbsolute}`);
  }
}

function copyDirectoryRecursive(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function sha256ForFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function buildManifest(args) {
  return {
    key: args.key,
    label: args.label,
    version: args.version,
    executableRelativePath: args.executable.replace(/\\/g, '/'),
    channel: args.channel,
    platform: args.platform,
  };
}

function packageBrowserCore(args) {
  ensureValidArgs(args);
  fs.mkdirSync(args.output, { recursive: true });

  const packageBasename = `${args.key}-${args.version}-${args.platform}.zip`;
  const packagePath = path.join(args.output, packageBasename);
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), `pro5-browser-core-stage-${args.key}-`));

  try {
    const runtimeDir = path.join(stageDir, 'runtime');
    copyDirectoryRecursive(args.input, runtimeDir);
    fs.writeFileSync(
      path.join(stageDir, 'browser-core.json'),
      `${JSON.stringify(buildManifest(args), null, 2)}\n`,
      'utf8',
    );

    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${path.join(stageDir, '*').replace(/'/g, "''")}' -DestinationPath '${packagePath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );

    return {
      packagePath,
      manifest: buildManifest(args),
      sizeBytes: fs.statSync(packagePath).size,
      sha256: sha256ForFile(packagePath),
    };
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = packageBrowserCore(args);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[package-browser-core] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildManifest,
  main,
  packageBrowserCore,
  parseArgs,
};

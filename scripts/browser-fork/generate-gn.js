const fs = require('fs/promises');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.join(repoRoot, '.browser-fork');
const outputDir = path.join(workspaceRoot, 'chromium', 'src', 'out', 'Pro5');
const argsPath = path.join(outputDir, 'args.gn');

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function readBoolean(name, fallback) {
  const value = readArg(name, String(fallback));
  return value === 'true';
}

async function main() {
  const isDebug = readBoolean('debug', false);
  const symbolLevel = readArg('symbol_level', isDebug ? '2' : '1');
  const targetCpu = readArg('target_cpu', 'x64');
  const brandingPath = readArg('branding_path', '//chrome/app/theme/pro5');

  const args = [
    `is_debug = ${isDebug}`,
    'is_component_build = false',
    `symbol_level = ${symbolLevel}`,
    `target_cpu = "${targetCpu}"`,
    'enable_nacl = false',
    'proprietary_codecs = true',
    'ffmpeg_branding = "Chrome"',
    'is_official_build = false',
    'treat_warnings_as_errors = false',
    'use_jumbo_build = true',
    'blink_symbol_level = 0',
    'v8_symbol_level = 0',
    'enable_iterator_debugging = false',
    `pro5_branding_path = "${brandingPath}"`,
  ];

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(argsPath, `${args.join('\n')}\n`, 'utf-8');

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    argsPath,
    args,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

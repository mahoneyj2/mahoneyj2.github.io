const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const checks = ['crt.js', 'sound.js', 'terminal.js'].map(file => ['--check', file]);
checks.push(['--test']);

for (const args of checks) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

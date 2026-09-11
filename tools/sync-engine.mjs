import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import chokidar from 'chokidar';

const workbenchRoot = fileURLToPath(new URL('..', import.meta.url));
const configPath = path.join(workbenchRoot, 'panorama.config.json');
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const dry = process.argv.includes('--dry-run');

function configPathValue(primary, legacy, fallback) {
  const value = typeof cfg[primary] === 'string' ? cfg[primary] : typeof cfg[legacy] === 'string' ? cfg[legacy] : fallback;
  return String(value).trim() || fallback;
}

const source = path.resolve(workbenchRoot, configPathValue('nonCompiledDir', 'sourceDir', './panorama'));
const target = path.resolve(workbenchRoot, configPathValue('editedDir', 'stagingDir', './edited-panorama'));
if (!fs.existsSync(source)) throw Error(`Non-compiled panorama assets directory does not exist: ${source}`);
if (source === target || target.startsWith(`${source}${path.sep}`) || source.startsWith(`${target}${path.sep}`)) throw Error('The non-compiled and edited asset directories must be separate, non-nested directories.');

console.log(`${dry ? 'Would synchronize' : 'Synchronizing'} ${source} -> ${target}`);
if (dry) process.exit(0);

let copying = false;
function copy() {
  if (copying) return;
  copying = true;
  try {
    fs.mkdirSync(target, {recursive: true});
    fs.cpSync(source, target, {recursive: true, force: true});
    console.log(`Synced panorama assets to ${target}`);
    const reloadCommand = typeof cfg.reloadCommand === 'string' ? cfg.reloadCommand.trim() : '';
    if (reloadCommand) {
      const child = spawn(reloadCommand, {cwd: workbenchRoot, shell: true, stdio: 'inherit', windowsHide: process.platform === 'win32'});
      child.on('error', error => console.error('Reload command failed:', error.message));
    }
  } finally {
    copying = false;
  }
}

copy();
const watcher = chokidar.watch(source, {ignoreInitial: true, awaitWriteFinish: {stabilityThreshold: 120, pollInterval: 20}}).on('all', () => copy());
console.log('Watching the non-compiled assets directory for changes. Press Ctrl+C to stop.');
process.on('SIGINT', () => {void watcher.close().finally(() => process.exit(0));});

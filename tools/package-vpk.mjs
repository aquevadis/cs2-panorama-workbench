import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const workbenchRoot = fileURLToPath(new URL('..', import.meta.url));
const configPath = path.join(workbenchRoot, 'panorama.config.json');
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function configPathValue(primary, legacy, fallback) {
  const value = typeof cfg[primary] === 'string' ? cfg[primary] : typeof cfg[legacy] === 'string' ? cfg[legacy] : fallback;
  return String(value).trim() || fallback;
}

function cleanPath(value) {
  return typeof value === 'string' ? value.trim().replace(/^['"]|['"]$/g, '') : '';
}

function resolveConfigPath(value) {
  const cleaned = cleanPath(value);
  return cleaned ? path.resolve(workbenchRoot, cleaned) : '';
}

const source = path.resolve(workbenchRoot, configPathValue('nonCompiledDir', 'sourceDir', './panorama'));
if (!fs.existsSync(source)) throw Error(`Non-compiled Panorama assets directory does not exist: ${source}. Set it with Edit Work Path first.`);

const configuredVpk = resolveConfigPath(cfg.vpkExe);
const envVpk = resolveConfigPath(process.env.VPK_EXE) || cleanPath(process.env.VPK_EXE);
const standardVpkPaths = process.platform === 'win32' ? [
  'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/vpk.exe',
  'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike 2/game/bin/win64/vpk.exe',
] : [];
const candidates = [configuredVpk, envVpk, ...standardVpkPaths].filter(Boolean);
const exe = candidates.find(candidate => fs.existsSync(candidate));
if (!exe) throw Error('vpk.exe not found. Set vpkExe in panorama.config.json or VPK_EXE. VPK packing does not compile Source 2 resources.');

console.log(`Packaging non-compiled Panorama assets from ${source}`);
const result = spawnSync(exe, [source], {stdio: 'inherit', windowsHide: process.platform === 'win32'});
if (result.error) throw Error(`Could not launch vpk.exe: ${result.error.message}`);
if (result.status !== 0) process.exit(result.status ?? 1);

const made = `${source}.vpk`;
if (!fs.existsSync(made)) throw Error(`Expected VPK output missing: ${made}`);
const desktopOutputDir = resolveConfigPath(cfg.desktopOutputDir) || path.join(os.homedir(), 'Desktop');
fs.mkdirSync(desktopOutputDir, {recursive: true});
const output = path.join(desktopOutputDir, 'custom_hud.vpk');
fs.copyFileSync(made, output);
console.log(`Created ${output}`);

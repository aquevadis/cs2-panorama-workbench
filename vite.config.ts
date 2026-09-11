import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workbenchRoot = fileURLToPath(new URL('.', import.meta.url));
const configPath = path.join(workbenchRoot, 'panorama.config.json');

function cleanCommandPath(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, '') || '';
}

function readRequestBody(request: IncomingMessage, maximumBytes = 100_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maximumBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(buffer);
    });
    request.on('error', reject);
    request.on('end', () => tooLarge ? reject(new Error('Request body is too large')) : resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function jsonResponse(response: {setHeader(name: string, value: string): void; statusCode: number; end(body?: string): void}, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function readWorkbenchConfig(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
}

function configString(config: Record<string, unknown>, key: string, fallback = '') {
  return typeof config[key] === 'string' ? config[key] as string : fallback;
}

function assetRoots() {
  const config = readWorkbenchConfig();
  // Read sourceDir once for a non-breaking upgrade, then persist only the
  // single source-workspace key used for discovery and saving.
  const nonCompiledDir = configString(config, 'nonCompiledDir', configString(config, 'sourceDir', './panorama')).trim() || './panorama';
  return {
    config,
    nonCompiledDir,
    nonCompiledRoot: path.resolve(workbenchRoot, nonCompiledDir),
  };
}

function panoramaConfigEndpoint(): Plugin {
  return {name: 'panorama-config-endpoint', configureServer(server) {
    server.middlewares.use('/__panorama/config', async (request, response, next) => {
      if (request.method === 'GET') {
        try {
          const roots = assetRoots();
          jsonResponse(response, 200, {nonCompiledDir: roots.nonCompiledDir});
        } catch (error) {
          jsonResponse(response, 500, {ok: false, error: error instanceof Error ? error.message : String(error)});
        }
        return;
      }
      if (request.method !== 'POST') return next();
      try {
        const body = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
        const config = readWorkbenchConfig();
        if (typeof body.nonCompiledDir !== 'string' || !body.nonCompiledDir.trim()) throw new Error('nonCompiledDir must be a non-empty path string');
        if (body.nonCompiledDir.includes('\0')) throw new Error('nonCompiledDir contains an invalid null character');
        config.nonCompiledDir = body.nonCompiledDir.trim();
        delete config.sourceDir;
        delete config.gameTargetDir;
        delete config.stagingDir;
        delete config.editedDir;
        fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        jsonResponse(response, 200, {ok: true, config: {nonCompiledDir: config.nonCompiledDir}});
      } catch (error) {
        jsonResponse(response, 400, {ok: false, error: error instanceof Error ? error.message : String(error)});
      }
    });
  }};
}

function chooseDirectory(initialPath: string) {
  const initial = cleanCommandPath(initialPath);
  if (process.platform === 'win32') {
    const script = '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = "Select a Panorama asset directory"; if ($env:PANORAMA_BROWSE_INITIAL -and (Test-Path -LiteralPath $env:PANORAMA_BROWSE_INITIAL -PathType Container)) { $dialog.SelectedPath = $env:PANORAMA_BROWSE_INITIAL }; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.WriteLine($dialog.SelectedPath) }';
    let lastError = '';
    for (const executable of ['powershell.exe', 'pwsh.exe']) {
      const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {encoding: 'utf8', windowsHide: true, env: {...process.env, PANORAMA_BROWSE_INITIAL: initial}});
      if (!result.error) {
        const selected = String(result.stdout || '').trim();
        if (selected) return {supported: true, path: selected};
        return {supported: true, cancelled: true};
      }
      lastError = result.error.message;
    }
    return {supported: false, message: `Windows directory picker could not start${lastError ? `: ${lastError}` : ''}`};
  }
  if (process.platform === 'darwin') {
    const result = spawnSync('osascript', ['-e', 'POSIX path of (choose folder with prompt "Select a Panorama asset directory")'], {encoding: 'utf8'});
    if (!result.error && result.status === 0) return {supported: true, path: String(result.stdout || '').trim()};
  }
  if (process.platform === 'linux') {
    const result = spawnSync('zenity', ['--file-selection', '--directory', '--title=Select a Panorama asset directory'], {encoding: 'utf8'});
    if (!result.error && result.status === 0) return {supported: true, path: String(result.stdout || '').trim()};
  }
  return {supported: false, message: 'A native directory picker is unavailable. Enter the full local path manually or use a browser with showDirectoryPicker().' };
}

function panoramaBrowseEndpoint(): Plugin {
  return {name: 'panorama-browse-endpoint', configureServer(server) {
    server.middlewares.use('/__panorama/browse', async (request, response, next) => {
      if (request.method !== 'POST') return next();
      try {
        const body = JSON.parse(await readRequestBody(request)) as {initialPath?: unknown};
        const result = chooseDirectory(typeof body.initialPath === 'string' ? body.initialPath : '');
        jsonResponse(response, 200, {ok: true, ...result});
      } catch (error) {
        jsonResponse(response, 400, {ok: false, error: error instanceof Error ? error.message : String(error)});
      }
    });
  }};
}

function scanSourceDirectory(directory: string, virtualDirectory: string, extension: string): Record<string, string> {
  const sources: Record<string, string> = {};
  if (!fs.existsSync(directory)) return sources;
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
        const relative = path.relative(directory, absolute).replace(/\\/g, '/');
        sources[`../panorama/${virtualDirectory}/${relative}`] = fs.readFileSync(absolute, 'utf8');
      }
    }
  };
  visit(directory);
  return sources;
}

function panoramaDiscoveryEndpoint(): Plugin {
  return {name: 'panorama-discovery-endpoint', configureServer(server) {
    server.middlewares.use('/__panorama/files', (request, response, next) => {
      if (request.method !== 'GET') return next();
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      try {
        const roots = assetRoots();
        response.statusCode = 200;
        response.end(JSON.stringify({
          layouts: scanSourceDirectory(path.join(roots.nonCompiledRoot, 'layout', 'custom_game'), 'layout/custom_game', '.vxml'),
          styles: scanSourceDirectory(path.join(roots.nonCompiledRoot, 'styles', 'custom_game'), 'styles/custom_game', '.vcss'),
          sourceDir: roots.nonCompiledDir,
          sourceExists: fs.existsSync(roots.nonCompiledRoot),
        }));
      } catch (error) {
        response.statusCode = 500;
        response.end(JSON.stringify({error: error instanceof Error ? error.message : String(error)}));
      }
    });
  }};
}

function valvePanoramaAssetLoader(): Plugin {
  return {name: 'valve-panorama-asset-loader', enforce: 'pre', transform(code, id) {
    const cleanId = id.split('?')[0];
    const lowerId = cleanId.toLowerCase();
    if (!lowerId.endsWith('.vxml') && !lowerId.endsWith('.vcss')) return null;
    let source = code;
    if (lowerId.endsWith('.vxml') && !source.trimStart().startsWith('<?xml')) source = `<?xml version="1.0" encoding="UTF-8"?>\n${source.trim()}`;
    return {code: `export default ${JSON.stringify(source)};`, map: null};
  }};
}

function panoramaSaveEndpoint(): Plugin {
  function safeRelative(requestPath: string, expectedPrefix: string, extension: string) {
    const normalized = String(requestPath || '').replace(/\\/g, '/');
    const marker = '/panorama/';
    const relative = (normalized.includes(marker) ? normalized.split(marker).pop()! : normalized.replace(/^\.?\.?\/?panorama\//i, '')).replace(/^\/+/, '');
    const segments = relative.split('/');
    if (!relative.startsWith(expectedPrefix) || !relative.toLowerCase().endsWith(extension) || segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error(`Invalid ${extension} target`);
    return relative;
  }
  return {name: 'panorama-save-endpoint', configureServer(server) {
    server.middlewares.use('/__panorama/save', (request, response, next) => {
      if (request.method !== 'POST') return next();
      const chunks: Buffer[] = [];
      let size = 0;
      request.on('data', chunk => {size += chunk.length; if (size <= 5_000_000) chunks.push(chunk);});
      request.on('end', () => {
        response.setHeader('Content-Type', 'application/json');
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {layoutPath?: string; stylePath?: string; layout?: string; styles?: string};
          if (typeof body.layout !== 'string' || typeof body.styles !== 'string') throw new Error('Layout and styles must be strings');
          const roots = assetRoots();
          const layoutTarget = path.resolve(roots.nonCompiledRoot, safeRelative(body.layoutPath || '', 'layout/custom_game/', '.vxml'));
          const styleTarget = path.resolve(roots.nonCompiledRoot, safeRelative(body.stylePath || '', 'styles/custom_game/', '.vcss'));
          if (!layoutTarget.startsWith(`${roots.nonCompiledRoot}${path.sep}`) || !styleTarget.startsWith(`${roots.nonCompiledRoot}${path.sep}`)) throw new Error('Target escapes the configured source workspace');
          fs.mkdirSync(path.dirname(layoutTarget), {recursive: true});
          fs.mkdirSync(path.dirname(styleTarget), {recursive: true});
          fs.writeFileSync(layoutTarget, body.layout, 'utf8');
          fs.writeFileSync(styleTarget, body.styles, 'utf8');
          response.statusCode = 200;
          response.end(JSON.stringify({ok: true, layoutPath: layoutTarget, stylePath: styleTarget}));
        } catch (error) {
          response.statusCode = 400;
          response.end(JSON.stringify({ok: false, error: error instanceof Error ? error.message : String(error)}));
        }
      });
    });
  }};
}

export default defineConfig(({mode}) => {
  const host = process.env.PANORAMA_DEV_HOST || '127.0.0.1';
  const port = Number(process.env.PANORAMA_DEV_PORT || 3000);
  return {
    root: workbenchRoot,
    plugins: [react(), valvePanoramaAssetLoader(), panoramaDiscoveryEndpoint(), panoramaSaveEndpoint(), panoramaConfigEndpoint(), panoramaBrowseEndpoint()],
    server: {
      host,
      port,
      strictPort: true,
      open: `http://${host}:${port}`,
      hmr: mode === 'no-hmr' ? false : {protocol: 'ws', host, port, clientPort: port},
    },
  };
});

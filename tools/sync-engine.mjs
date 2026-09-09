import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process'; import chokidar from 'chokidar';
const cfg=JSON.parse(fs.readFileSync('panorama.config.json','utf8')); const dry=process.argv.includes('--dry-run');
const source=path.resolve(cfg.sourceDir); if(!cfg.gameTargetDir) throw Error('Set gameTargetDir in panorama.config.json'); const target=path.resolve(cfg.gameTargetDir);
console.log(`${dry?'Would synchronize':'Synchronizing'} ${source} -> ${target}`);
if(dry) process.exit(0);
function copy(){fs.mkdirSync(target,{recursive:true});fs.cpSync(source,target,{recursive:true,force:true});if(cfg.reloadCommand){const child=spawn(cfg.reloadCommand,{shell:true,stdio:'inherit'});child.on('error',e=>console.error('Reload command failed:',e.message));}}
if(process.platform==='win32'&&!fs.existsSync(target)){try{fs.symlinkSync(source,target,'junction');console.log('Junction created');}catch(e){console.warn('Junction unavailable; using mirror:',e.message);copy();}}else copy();
if(!fs.lstatSync(target).isSymbolicLink())chokidar.watch(source,{ignoreInitial:true}).on('all',()=>copy());
console.log('Watching for changes. Press Ctrl+C to stop.');

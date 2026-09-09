import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawnSync } from 'node:child_process';
const cfg=JSON.parse(fs.readFileSync('panorama.config.json','utf8')); const source=path.resolve(cfg.sourceDir); const stage=path.resolve(cfg.stagingDir);
fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});fs.cpSync(source,stage,{recursive:true});
const roots=[cfg.vpkExe,process.env.VPK_EXE,'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/vpk.exe'].filter(Boolean);
const exe=roots.find(fs.existsSync);if(!exe)throw Error('vpk.exe not found. Set vpkExe or VPK_EXE. Packing does not compile Source 2 resources.');
const result=spawnSync(exe,[stage],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
const made=`${stage}.vpk`;if(!fs.existsSync(made))throw Error(`Expected output missing: ${made}`);
const out=path.resolve(cfg.desktopOutputDir||path.join(os.homedir(),'Desktop'),'custom_hud.vpk');fs.copyFileSync(made,out);console.log(`Created ${out}`);

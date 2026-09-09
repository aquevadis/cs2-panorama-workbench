import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workbenchRoot=fileURLToPath(new URL('.',import.meta.url));

function scanSourceDirectory(directory:string,extension:string):Record<string,string>{
  const sources:Record<string,string>={};
  if(!fs.existsSync(directory))return sources;
  const visit=(current:string)=>{for(const entry of fs.readdirSync(current,{withFileTypes:true})){const absolute=path.join(current,entry.name);if(entry.isDirectory())visit(absolute);else if(entry.isFile()&&entry.name.toLowerCase().endsWith(extension)){const relative=path.relative(workbenchRoot,absolute).replace(/\\/g,'/');sources[`../${relative}`]=fs.readFileSync(absolute,'utf8')}}};
  visit(directory);return sources;
}

function panoramaDiscoveryEndpoint():Plugin{
  const panoramaRoot=path.join(workbenchRoot,'panorama');
  return {name:'panorama-discovery-endpoint',configureServer(server){server.middlewares.use('/__panorama/files',(request,response,next)=>{if(request.method!=='GET')return next();response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');try{response.statusCode=200;response.end(JSON.stringify({layouts:scanSourceDirectory(path.join(panoramaRoot,'layout','custom_game'),'.vxml'),styles:scanSourceDirectory(path.join(panoramaRoot,'styles','custom_game'),'.vcss')}))}catch(error){response.statusCode=500;response.end(JSON.stringify({error:error instanceof Error?error.message:String(error)}))}})}};
}

function valvePanoramaAssetLoader(): Plugin {
  return {
    name: 'valve-panorama-asset-loader',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0];
      const lowerId=cleanId.toLowerCase();
      if (!lowerId.endsWith('.vxml') && !lowerId.endsWith('.vcss')) return null;
      let source = code;
      if (lowerId.endsWith('.vxml') && !source.trimStart().startsWith('<?xml'))
        source = `<?xml version="1.0" encoding="UTF-8"?>\n${source.trim()}`;
      return { code: `export default ${JSON.stringify(source)};`, map: null };
    }
  };
}

function panoramaSaveEndpoint(): Plugin {
  const panoramaRoot = path.resolve(workbenchRoot,'panorama');
  function safeTarget(requestPath: string, expectedPrefix: string, extension: string) {
    const normalized=requestPath.replace(/\\/g,'/');
    const marker='/panorama/';
    const relative=(normalized.includes(marker)?normalized.split(marker).pop()!:normalized.replace(/^\.\.\/panorama\//,'')).replace(/^\/+/, '');
    if (!relative.startsWith(expectedPrefix) || !relative.toLowerCase().endsWith(extension)) throw new Error(`Invalid ${extension} target`);
    const target=path.resolve(panoramaRoot,relative);
    if (!target.startsWith(`${panoramaRoot}${path.sep}`)) throw new Error('Target escapes the panorama directory');
    return target;
  }
  return {name:'panorama-save-endpoint',configureServer(server){server.middlewares.use('/__panorama/save',(request,response,next)=>{
    if(request.method!=='POST')return next();
    const chunks:Buffer[]=[];let size=0;
    request.on('data',chunk=>{size+=chunk.length;if(size>5_000_000)request.destroy();else chunks.push(chunk)});
    request.on('end',()=>{response.setHeader('Content-Type','application/json');try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {layoutPath:string;stylePath:string;layout:string;styles:string};const layoutTarget=safeTarget(body.layoutPath,'layout/custom_game/','.vxml');const styleTarget=safeTarget(body.stylePath,'styles/custom_game/','.vcss');fs.mkdirSync(path.dirname(layoutTarget),{recursive:true});fs.mkdirSync(path.dirname(styleTarget),{recursive:true});fs.writeFileSync(layoutTarget,body.layout,'utf8');fs.writeFileSync(styleTarget,body.styles,'utf8');response.statusCode=200;response.end(JSON.stringify({ok:true}))}catch(error){response.statusCode=400;response.end(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}))}});
  })}};
}

export default defineConfig(({ mode }) => {
  const host = process.env.PANORAMA_DEV_HOST || '127.0.0.1';
  const port = Number(process.env.PANORAMA_DEV_PORT || 3000);
  return {
    root:workbenchRoot,
    plugins: [react(), valvePanoramaAssetLoader(), panoramaDiscoveryEndpoint(), panoramaSaveEndpoint()],
    server: {
      host,
      port,
      strictPort: true,
      open: `http://${host}:${port}`,
      hmr: mode === 'no-hmr' ? false : { protocol: 'ws', host, port, clientPort: port }
    }
  };
});

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { EditorOutput, PanoramaEditor } from './PanoramaEditor';
import { PanoramaSandbox } from './PanoramaSandbox';
import { discoverPanoramaLayouts, isValidPanoramaLayout, PanoramaLayoutFile, PanoramaSourceFiles } from './panoramaFiles';

const bundledLayouts = discoverPanoramaLayouts();

function completeLayout(original: string, generated: string, stylePath: string): string {
  const metadata: string[] = [];
  for (const tag of ['styles','scripts','snippets']) {
    const match = original.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,'i'));
    if (match) metadata.push(match[0]);
  }
  if (!metadata.some(block => /^<styles\b/i.test(block))) metadata.unshift(`<styles><include src="file://{resources}/styles/custom_game/${stylePath}" /></styles>`);
  const tree = generated.replace(/^\s*<root>\s*/i,'').replace(/\s*<\/root>\s*$/i,'');
  return `<root>\n${metadata.map(block=>`  ${block}`).join('\n')}\n${tree}\n</root>\n`;
}

export function App() {
  const [discoveredLayouts,setDiscoveredLayouts] = useState(bundledLayouts);
  const [openedLayouts,setOpenedLayouts] = useState<PanoramaLayoutFile[]>([]);
  const layouts = useMemo(() => [...openedLayouts,...discoveredLayouts.filter(file=>!openedLayouts.some(opened=>opened.path===file.path))], [openedLayouts,discoveredLayouts]);
  const [selectedPath,setSelectedPath] = useState(bundledLayouts[0]?.path || '');
  const [output,setOutput] = useState<EditorOutput>({xml:'',css:''});
  const [status,setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const discoverySignature = useRef('');
  const selected = layouts.find(file=>file.path===selectedPath) || layouts[0];
  const onOutputChange = useCallback((next:EditorOutput) => setOutput(next),[]);
  const relativeName = selected?.name.replace(/^\/+/, '') || 'panorama_layout.vxml';
  const baseName = relativeName.replace(/\.vxml$/i,'');
  const generatedLayout = selected && output.xml ? completeLayout(selected.layout,output.xml,`${baseName}.vcss`) : '';

  const refreshDiscoveredLayouts=useCallback(async()=>{
    try{
      const response=await fetch('/__panorama/files',{cache:'no-store'});
      if(!response.ok)return;
      const raw=await response.text();if(raw===discoverySignature.current)return;
      const sources=JSON.parse(raw) as PanoramaSourceFiles;
      const next=discoverPanoramaLayouts(sources.layouts||{},sources.styles||{});
      discoverySignature.current=raw;setDiscoveredLayouts(next);setSelectedPath(current=>next.some(file=>file.path===current)||current.startsWith('opened://')?current:next[0]?.path||'');
    }catch{/* Production builds use the statically bundled file list. */}
  },[]);
  useEffect(()=>{void refreshDiscoveredLayouts();const timer=window.setInterval(()=>void refreshDiscoveredLayouts(),2000);window.addEventListener('focus',refreshDiscoveredLayouts);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refreshDiscoveredLayouts)}},[refreshDiscoveredLayouts]);

  async function save() {
    if (!selected || !generatedLayout) return;
    try {
      if (selected.path.startsWith('opened://')) {
        localStorage.setItem(`cs2-panorama-opened:${selected.path}`,JSON.stringify({xml:generatedLayout,css:output.css}));
        setStatus(`Saved browser draft for ${selected.name}; use Download ZIP to write files.`);
      } else {
        const stylePath=selected.styleTargetPath || `../panorama/styles/custom_game/${baseName}.vcss`;
        const response=await fetch('/__panorama/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({layoutPath:selected.path,stylePath,layout:generatedLayout,styles:output.css})});
        const result=await response.json() as {ok?:boolean;error?:string};
        if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
        setStatus(`Saved ${relativeName} and ${baseName}.vcss to ./panorama.`);
      }
    } catch (error) { setStatus(`Save failed: ${error instanceof Error?error.message:String(error)}`); }
    if (menuRef.current) menuRef.current.open=false;
  }

  async function openFiles(event: ChangeEvent<HTMLInputElement>) {
    const files=[...(event.target.files||[])]; const layoutFile=files.find(file=>file.name.toLowerCase().endsWith('.vxml')); const styleFile=files.find(file=>file.name.toLowerCase().endsWith('.vcss'));
    if (!layoutFile) { setStatus('Open requires one .vxml file; optionally select its .vcss too.'); return; }
    const layout=await layoutFile.text(); if (!isValidPanoramaLayout(layout)) { setStatus(`${layoutFile.name} is not a valid editable Panorama layout.`); return; }
    const styles=styleFile?await styleFile.text():''; const path=`opened://${layoutFile.name}`; const opened:PanoramaLayoutFile={path,name:layoutFile.name,layout,styles,stylePaths:styleFile?[`opened://${styleFile.name}`]:[],styleTargetPath:styleFile?`opened://${styleFile.name}`:`opened://${layoutFile.name.replace(/\.vxml$/i,'.vcss')}`};
    setOpenedLayouts(value=>[opened,...value.filter(file=>file.path!==path)]); setOutput({xml:'',css:''}); setSelectedPath(path); setStatus(`Opened ${layoutFile.name}${styleFile?` with ${styleFile.name}`:''}`); event.target.value='';
  }

  async function downloadZip() {
    if (!selected || !generatedLayout) return;
    const zip=new JSZip(); zip.file(`panorama/layout/custom_game/${relativeName}`,generatedLayout); zip.file(`panorama/styles/custom_game/${baseName}.vcss`,output.css);
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=`${baseName.split('/').pop()||'panorama-layout'}.zip`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),0); setStatus(`Downloaded ${link.download}`); if(menuRef.current)menuRef.current.open=false;
  }

  return <main><div className="workspace">
    <header className="app-header">
      <div className="brand"><strong>CS2 Panorama Workbench</strong><span>{layouts.length} valid layout{layouts.length===1?'':'s'}</span></div>
      <label className="layout-switcher">Layout<select value={selected?.path||''} onChange={event=>{setOutput({xml:'',css:''});setSelectedPath(event.target.value);setStatus('')}} disabled={!layouts.length}>{layouts.map(file=><option key={file.path} value={file.path}>{file.name}</option>)}</select></label>
      <div className={selected?.stylePaths.length?'match-ok':'match-missing'}>{selected?.stylePaths.length?`VCSS: ${selected.stylePaths.map(path=>path.split('/').pop()).join(', ')}`:'No matching VCSS'}</div>
      <details className="file-menu" ref={menuRef}><summary>File ▾</summary><div><button onClick={save} disabled={!selected||!output.xml}>Save</button><button onClick={()=>{inputRef.current?.click();if(menuRef.current)menuRef.current.open=false}}>Open…</button><button onClick={downloadZip} disabled={!selected||!output.xml}>Download ZIP</button></div></details>
      <input ref={inputRef} className="hidden-file-input" type="file" accept=".vxml,.vcss" multiple onChange={openFiles}/>
    </header>
    {status&&<div className="file-status">{status}</div>}
    {selected?<><PanoramaEditor key={selected.path} sourceName={selected.name} sourceLayout={selected.layout} sourceStyles={selected.styles} onOutputChange={onOutputChange}/><details className="source-preview"><summary>Original source preview</summary><PanoramaSandbox layout={selected.layout} styles={selected.styles}/></details></>:<section className="empty-state">Place `.vxml` files in <code>panorama/layout/custom_game</code> and `.vcss` files in <code>panorama/styles/custom_game</code>.</section>}
  </div></main>;
}

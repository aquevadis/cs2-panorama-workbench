import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import JSZip from 'jszip';
import { EditorOutput, LayoutInsertRequest, PanoramaEditor } from './PanoramaEditor';
import { discoverPanoramaLayouts, isValidPanoramaLayout, PanoramaLayoutFile, PanoramaSourceFiles } from './panoramaFiles';

const bundledLayouts = discoverPanoramaLayouts();
type WorkPath = { nonCompiledDir: string };
type BrowseResponse = { ok?: boolean; path?: string; cancelled?: boolean; supported?: boolean; error?: string; message?: string };
type DirectoryPickerWindow = Window & { showDirectoryPicker?: () => Promise<{name: string}> };

function completeLayout(original: string, generated: string, stylePath: string): string {
  const metadata: string[] = [];
  for (const tag of ['styles','scripts','snippets']) {
    const match = original.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'i'));
    if (match) metadata.push(match[0]);
  }
  if (!metadata.some(block => /^<styles\b/i.test(block))) metadata.unshift(`<styles><include src="file://{resources}/styles/custom_game/${stylePath}" /></styles>`);
  const tree = generated.replace(/^\s*<root>\s*/i, '').replace(/\s*<\/root>\s*$/i, '');
  return `<root>\n${metadata.map(block => `  ${block}`).join('\n')}\n${tree}\n</root>\n`;
}

function retargetStyleInclude(layout: string, stylePath: string) {
  const source = `file://{resources}/styles/custom_game/${stylePath}`;
  return layout.replace(/(<include\b[^>]*\bsrc\s*=\s*["'])[^"']+\.vcss(?:_c)?(["'])/i, `$1${source}$2`);
}

function sourceTargets(file: PanoramaLayoutFile) {
  const relativeName = file.name.replace(/^\/+/, '') || 'panorama_layout.vxml';
  const baseName = relativeName.replace(/\.vxml$/i, '');
  const layoutPath = /\/layout\/custom_game\//i.test(file.path) ? file.path : `../panorama/layout/custom_game/${relativeName}`;
  const stylePath = /\/styles\/custom_game\//i.test(file.styleTargetPath || '') ? file.styleTargetPath : `../panorama/styles/custom_game/${baseName}.vcss`;
  const styleIncludePath = stylePath.replace(/^.*\/styles\/custom_game\//i, '').replace(/^\/+/, '') || `${baseName}.vcss`;
  return {layoutPath, stylePath, styleIncludePath, relativeName, baseName};
}

export function App() {
  const [discoveredLayouts, setDiscoveredLayouts] = useState(bundledLayouts);
  const [openedLayouts, setOpenedLayouts] = useState<PanoramaLayoutFile[]>([]);
  const layouts = useMemo(() => [...openedLayouts, ...discoveredLayouts.filter(file => !openedLayouts.some(opened => opened.path === file.path))], [openedLayouts, discoveredLayouts]);
  const [selectedPath, setSelectedPath] = useState(bundledLayouts[0]?.path || '');
  const [output, setOutput] = useState<EditorOutput>({xml: '', css: '', dirty: false, touched: false});
  const [status, setStatus] = useState('');
  const [workPath, setWorkPath] = useState<WorkPath>({nonCompiledDir: ''});
  const [workPathOpen, setWorkPathOpen] = useState(false);
  const [workPathLoading, setWorkPathLoading] = useState(false);
  const [workPathSaving, setWorkPathSaving] = useState(false);
  const [workPathStatus, setWorkPathStatus] = useState('');
  const [browseLoading, setBrowseLoading] = useState(false);
  const [copyLayoutOpen, setCopyLayoutOpen] = useState(false);
  const [copyLayoutName, setCopyLayoutName] = useState('');
  const [copyLayoutSaving, setCopyLayoutSaving] = useState(false);
  const [copyLayoutStatus, setCopyLayoutStatus] = useState('');
  const [layoutQuery, setLayoutQuery] = useState('');
  const [insertRequest, setInsertRequest] = useState<LayoutInsertRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const layoutMenuRef = useRef<HTMLDetailsElement>(null);
  const discoverySignature = useRef('');
  const selected = layouts.find(file => file.path === selectedPath) || layouts[0];
  const filteredLayouts = layouts.filter(file => file.name.toLowerCase().includes(layoutQuery.trim().toLowerCase()));
  const targets = selected ? sourceTargets(selected) : null;
  const relativeName = targets?.relativeName || 'panorama_layout.vxml';
  const baseName = targets?.baseName || 'panorama_layout';
  const generatedLayout = selected && targets && output.xml ? completeLayout(selected.layout, output.xml, targets.styleIncludePath) : '';
  const onOutputChange = useCallback((next: EditorOutput) => setOutput(next), []);

  const refreshDiscoveredLayouts = useCallback(async () => {
    try {
      const response = await fetch('/__panorama/files', {cache: 'no-store'});
      if (!response.ok) return;
      const raw = await response.text();
      if (raw === discoverySignature.current) return;
      const sources = JSON.parse(raw) as PanoramaSourceFiles;
      const next = discoverPanoramaLayouts(sources.layouts || {}, sources.styles || {});
      discoverySignature.current = raw;
      setDiscoveredLayouts(next);
      setSelectedPath(current => next.some(file => file.path === current) || current.startsWith('opened://') || current.startsWith('copy://') ? current : next[0]?.path || '');
    } catch {
      // Production builds use the statically bundled file list.
    }
  }, []);

  useEffect(() => {
    void refreshDiscoveredLayouts();
    const timer = window.setInterval(() => void refreshDiscoveredLayouts(), 2000);
    window.addEventListener('focus', refreshDiscoveredLayouts);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshDiscoveredLayouts); };
  }, [refreshDiscoveredLayouts]);

  const openWorkPath = useCallback(async () => {
    setWorkPathOpen(true);
    setWorkPathLoading(true);
    setWorkPathStatus('');
    try {
      const response = await fetch('/__panorama/config', {cache: 'no-store'});
      const result = await response.json() as Partial<WorkPath> & {error?: string};
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setWorkPath({nonCompiledDir: result.nonCompiledDir || ''});
    } catch (error) {
      setWorkPathStatus(`Could not load panorama.config.json: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorkPathLoading(false);
    }
  }, []);

  async function browseWorkPath() {
    if (browseLoading) return;
    setBrowseLoading(true);
    setWorkPathStatus('');
    try {
      const response = await fetch('/__panorama/browse', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({initialPath: workPath.nonCompiledDir})});
      const result = await response.json() as BrowseResponse;
      if (response.ok && result.path) { setWorkPath({nonCompiledDir: result.path}); return; }
      if (result.cancelled) return;
      const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
      if (picker) {
        try {
          const directory = await picker();
          setWorkPathStatus(`Browser selected “${directory.name}”, but browsers do not expose its absolute path. Paste the full path, or use native Browse while running npm run dev.`);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          throw error;
        }
        return;
      }
      throw new Error(result.message || 'Directory browsing is available from the Vite development server only.');
    } catch (error) {
      setWorkPathStatus(`Could not browse for a directory: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBrowseLoading(false);
    }
  }

  async function saveWorkPath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkPathSaving(true);
    setWorkPathStatus('');
    try {
      if (!workPath.nonCompiledDir.trim()) throw new Error('The non-compiled Panorama assets directory is required.');
      const response = await fetch('/__panorama/config', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(workPath)});
      const result = await response.json() as {ok?: boolean; error?: string};
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      discoverySignature.current = '';
      await refreshDiscoveredLayouts();
      setStatus('Work path saved. Layout discovery now uses this directory.');
      setWorkPathOpen(false);
    } catch (error) {
      setWorkPathStatus(`Could not save panorama.config.json: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorkPathSaving(false);
    }
  }

  async function openFolder() {
    if (menuRef.current) menuRef.current.open = false;
    setStatus('Choose a Panorama source folder…');
    try {
      const configResponse = await fetch('/__panorama/config', {cache: 'no-store'});
      const config = await configResponse.json() as Partial<WorkPath> & {error?: string};
      if (!configResponse.ok) throw new Error(config.error || `HTTP ${configResponse.status}`);
      const browseResponse = await fetch('/__panorama/browse', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({initialPath: config.nonCompiledDir || ''})});
      const selectedFolder = await browseResponse.json() as BrowseResponse;
      if (selectedFolder.cancelled) { setStatus('Open Folder cancelled.'); return; }
      if (!browseResponse.ok || !selectedFolder.path) throw new Error(selectedFolder.error || selectedFolder.message || 'Native folder browsing is unavailable.');
      const nextPath = {nonCompiledDir:selectedFolder.path};
      const saveResponse = await fetch('/__panorama/config', {method: 'POST', headers: {'Content-Type':'application/json'}, body:JSON.stringify(nextPath)});
      const saveResult = await saveResponse.json() as {ok?:boolean;error?:string};
      if (!saveResponse.ok || !saveResult.ok) throw new Error(saveResult.error || `HTTP ${saveResponse.status}`);
      setWorkPath(nextPath);
      setInsertRequest(null);
      discoverySignature.current = '';
      await refreshDiscoveredLayouts();
      setStatus(`Opened Panorama folder: ${selectedFolder.path}`);
    } catch (error) {
      await openWorkPath();
      setStatus(`Open Folder needs a local directory path: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  useEffect(() => {
    if (!workPathOpen && !copyLayoutOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (copyLayoutOpen) setCopyLayoutOpen(false);
      else setWorkPathOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyLayoutOpen, workPathOpen]);

  async function save() {
    if (!selected || !generatedLayout) return;
    try {
      if (selected.path.startsWith('opened://')) {
        localStorage.setItem(`cs2-panorama-opened:${selected.path}`, JSON.stringify({xml: generatedLayout, css: output.css}));
        setStatus(`Saved browser draft for ${selected.name}; use Download ZIP to write files.`);
      } else {
        const stylePath = selected.styleTargetPath || `../panorama/styles/custom_game/${baseName}.vcss`;
        const response = await fetch('/__panorama/save', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({layoutPath: selected.path, stylePath, layout: generatedLayout, styles: output.css})});
        const result = await response.json() as {ok?: boolean; error?: string};
        if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
        setStatus(`Saved ${relativeName} and ${baseName}.vcss to the configured source workspace.`);
        discoverySignature.current = '';
        void refreshDiscoveredLayouts();
      }
    } catch (error) {
      setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (menuRef.current) menuRef.current.open = false;
  }

  function openCopyLayout() {
    if (!selected || !output.xml) return;
    setCopyLayoutName(`${baseName}_copy`);
    setCopyLayoutStatus('');
    setCopyLayoutOpen(true);
    if (menuRef.current) menuRef.current.open = false;
  }

  async function copyLayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !generatedLayout) return;
    setCopyLayoutSaving(true);
    setCopyLayoutStatus('');
    try {
      const relative = copyLayoutName.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.(?:vxml|vcss)$/i, '');
      if (!relative || relative.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Enter a relative layout name such as custom_hud_copy or variants/custom_hud_copy.');
      const layoutPath = `../panorama/layout/custom_game/${relative}.vxml`;
      const stylePath = `../panorama/styles/custom_game/${relative}.vcss`;
      const copiedLayout = retargetStyleInclude(generatedLayout, `${relative}.vcss`);
      const response = await fetch('/__panorama/save', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({layoutPath, stylePath, layout: copiedLayout, styles: output.css})});
      const result = await response.json() as {ok?: boolean; error?: string};
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      const copyPath = layoutPath;
      const copied: PanoramaLayoutFile = {path: copyPath, name: `${relative}.vxml`, layout: copiedLayout, styles: output.css, stylePaths: [stylePath], styleTargetPath: stylePath};
      setOpenedLayouts(current => [copied, ...current.filter(file => file.path !== copyPath)]);
      setInsertRequest(null);
      setSelectedPath(copyPath);
      discoverySignature.current = '';
      void refreshDiscoveredLayouts();
      setCopyLayoutOpen(false);
      setStatus(`Copied ${relativeName} to ${relative}.vxml in the configured source workspace.`);
    } catch (error) {
      setCopyLayoutStatus(`Could not copy layout: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCopyLayoutSaving(false);
    }
  }

  async function openFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])];
    const layoutFile = files.find(file => file.name.toLowerCase().endsWith('.vxml'));
    const styleFile = files.find(file => file.name.toLowerCase().endsWith('.vcss'));
    if (!layoutFile) { setStatus('Open requires one .vxml file; optionally select its .vcss too.'); return; }
    const layout = await layoutFile.text();
    if (!isValidPanoramaLayout(layout)) { setStatus(`${layoutFile.name} is not a valid editable Panorama layout.`); return; }
    const styles = styleFile ? await styleFile.text() : '';
    const path = `opened://${layoutFile.name}`;
    const opened: PanoramaLayoutFile = {path, name: layoutFile.name, layout, styles, stylePaths: styleFile ? [`opened://${styleFile.name}`] : [], styleTargetPath: styleFile ? `opened://${styleFile.name}` : `opened://${layoutFile.name.replace(/\.vxml$/i, '.vcss')}`};
    setOpenedLayouts(value => [opened, ...value.filter(file => file.path !== path)]);
    setInsertRequest(null);
    setOutput({xml: '', css: '', dirty: false, touched: false});
    setSelectedPath(path);
    setStatus(`Opened ${layoutFile.name}${styleFile ? ` with ${styleFile.name}` : ''}`);
    event.target.value = '';
  }

  async function downloadZip() {
    if (!selected || !generatedLayout) return;
    const zip = new JSZip();
    zip.file(`panorama/layout/custom_game/${relativeName}`, generatedLayout);
    zip.file(`panorama/styles/custom_game/${baseName}.vcss`, output.css);
    const blob = await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName.split('/').pop() || 'panorama-layout'}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(`Downloaded ${link.download}`);
    if (menuRef.current) menuRef.current.open = false;
  }

  return <>
    <main>
      <div className="workspace">
        <header className="app-header">
          <div className="layout-switcher"><span>Layout</span><details className="layout-menu" ref={layoutMenuRef}><summary>{selected?.name||'No valid layouts found'}<span>▾</span></summary><div className="layout-menu-popover"><input type="search" value={layoutQuery} onChange={event=>setLayoutQuery(event.target.value)} placeholder="Search layouts…" aria-label="Search loaded layouts"/>{filteredLayouts.length?<ul>{filteredLayouts.map(file=><li className="layout-option" key={file.path}><button type="button" className={`layout-open${file.path===selected?.path?' active':''}`} onClick={()=>{setInsertRequest(null);setOutput({xml:'',css:'',dirty:false,touched:false});setSelectedPath(file.path);setStatus('');if(layoutMenuRef.current)layoutMenuRef.current.open=false}}><span>{file.name}</span><small>{file.stylePaths.length} VCSS file{file.stylePaths.length===1?'':'s'}</small></button><button type="button" className="layout-insert" aria-label={`Insert ${file.name} into current layout`} title={`Insert ${file.name} into current layout`} disabled={!selected} onClick={()=>{setInsertRequest({key:Date.now(),name:file.name,layout:file.layout,styles:file.styles});if(layoutMenuRef.current)layoutMenuRef.current.open=false}}>↗</button></li>)}</ul>:<p className="layout-menu-empty">No layouts match this search.</p>}</div></details></div>
          <div className={`vcss-info${selected?.stylePaths.length?' match-ok':' match-missing'}`} tabIndex={0}><button type="button" aria-label="Show loaded VCSS information">i</button><div className="vcss-popover" role="tooltip"><strong>Loaded VCSS files</strong>{selected?.stylePaths.length?<ul>{selected.stylePaths.map(path=><li key={path}>{path.replace(/^.*\/styles\/custom_game\//i,'styles/custom_game/')}</li>)}</ul>:<p>No referenced or same-name VCSS file is loaded.</p>}</div></div>
          <div className="workbench-actions" aria-label="Workbench actions"><button type="button" onClick={() => void openWorkPath()} title="Edit the Panorama source workspace directory">Edit Work Path</button></div>
          <details className="file-menu" ref={menuRef}><summary>File ▾</summary><div><button onClick={save} disabled={!selected || !output.xml}>Save</button><button onClick={openCopyLayout} disabled={!selected || !output.xml}>Copy Layout…</button><button onClick={() => {inputRef.current?.click(); if (menuRef.current) menuRef.current.open = false;}}>Open…</button><button onClick={()=>void openFolder()}>Open Folder…</button><button onClick={downloadZip} disabled={!selected || !output.xml}>Download ZIP</button></div></details>
          <input ref={inputRef} className="hidden-file-input" type="file" accept=".vxml,.vcss" multiple onChange={openFiles}/>
        </header>
        {status&&<div className="app-toast" role="status">{status}</div>}
        {selected ? <PanoramaEditor key={selected.path} sourceName={selected.name} sourceLayout={selected.layout} sourceStyles={selected.styles} componentLayouts={discoveredLayouts} insertRequest={insertRequest} onInsertResult={message=>setStatus(message)} onOutputChange={onOutputChange}/> : <section className="empty-state">Set the source workspace in <strong>Edit Work Path</strong>, then place layouts under <code>layout/custom_game</code> and styles under <code>styles/custom_game</code>.</section>}
      </div>
    </main>
    {workPathOpen&&<div className="work-path-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setWorkPathOpen(false)}}><section className="work-path-modal" role="dialog" aria-modal="true" aria-labelledby="work-path-modal-title" onMouseDown={event=>event.stopPropagation()}><header><div><h2 id="work-path-modal-title">Edit Work Path</h2><p>Choose the source workspace used to discover and save editable Panorama assets.</p></div><button type="button" className="modal-close" aria-label="Close Edit Work Path" onClick={()=>setWorkPathOpen(false)}>×</button></header>{workPathLoading?<p className="work-path-loading">Loading panorama.config.json…</p>:<form onSubmit={saveWorkPath}><label className="work-path-field"><span>Non-compiled panorama assets (.VXML/.VCSS/.VJS) local directory path</span><div className="path-input-row"><input type="text" value={workPath.nonCompiledDir} onChange={event=>setWorkPath({nonCompiledDir:event.target.value})} spellCheck={false}/><button type="button" onClick={()=>void browseWorkPath()} disabled={browseLoading}>{browseLoading?'Choosing…':'Browse'}</button></div><small>Layouts load from layout/custom_game and styles from styles/custom_game. Save and Copy Layout write back into this same workspace.</small></label>{workPathStatus&&<p className="work-path-status">{workPathStatus}</p>}<footer><button type="button" onClick={()=>setWorkPathOpen(false)}>Cancel</button><button type="submit" disabled={workPathSaving}>{workPathSaving?'Saving…':'Save Work Path'}</button></footer></form>}</section></div>}
    {copyLayoutOpen&&<div className="work-path-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setCopyLayoutOpen(false)}}><section className="work-path-modal copy-layout-modal" role="dialog" aria-modal="true" aria-labelledby="copy-layout-modal-title" onMouseDown={event=>event.stopPropagation()}><header><div><h2 id="copy-layout-modal-title">Copy HUD Layout</h2><p>Copy the current layout and generated VCSS into the configured source workspace.</p></div><button type="button" className="modal-close" aria-label="Close Copy HUD Layout" onClick={()=>setCopyLayoutOpen(false)}>×</button></header><form onSubmit={copyLayout}><label><span>New layout name/path</span><input type="text" value={copyLayoutName} onChange={event=>setCopyLayoutName(event.target.value)} spellCheck={false} autoFocus/><small>Use a relative name without an extension. Nested paths are preserved below layout/custom_game and styles/custom_game.</small></label>{copyLayoutStatus&&<p className="work-path-status">{copyLayoutStatus}</p>}<footer><button type="button" onClick={()=>setCopyLayoutOpen(false)}>Cancel</button><button type="submit" disabled={copyLayoutSaving}>{copyLayoutSaving?'Copying…':'Copy Layout'}</button></footer></form></section></div>}
  </>;
}

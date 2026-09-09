import React, { CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parsePanoramaDocument } from './panoramaFiles';
import { normalizeVcssValue, styleOptions, valueRules } from './vcssValues';

type Kind = 'Panel' | 'Label' | 'Image' | 'Button';
type Node = {
  uid: number;
  kind: Kind;
  id: string;
  className: string;
  text?: string;
  src?: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  children: Node[];
};
export type EditorOutput = { xml: string; css: string };
type Viewport = {width:number;height:number;label:string};
type CanvasMetrics = {x:number;y:number;width:number;height:number};
const viewports:Viewport[]=[{width:1920,height:1080,label:'1920 × 1080 (16:9)'},{width:2560,height:1440,label:'2560 × 1440 (16:9)'},{width:3440,height:1440,label:'3440 × 1440 (ultrawide)'},{width:1280,height:720,label:'1280 × 720 (16:9)'}];

let nextUid = 1;

type PanoramaStyleRule = { classes: string[]; id?: string; declarations: Record<string, string> };

function parseDeclarations(body: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 1) continue;
    const property = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (property && value) declarations[property] = value;
  }
  return declarations;
}

function parseStyles(source: string): PanoramaStyleRule[] {
  const result: PanoramaStyleRule[] = [];
  const blocks = source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const block of blocks) {
    const declarations = parseDeclarations(block[2]);
    if (!Object.keys(declarations).length) continue;
    for (const selector of block[1].split(',')) {
      const clean = selector.trim();
      // The editor can resolve simple class compounds such as .Alert.Active.
      // Complex selectors and pseudo states remain in the source preview only.
      const unsupported = clean.replace(/\.[\w-]+/g, '').replace(/#[\w-]+/g, '');
      if (!clean || /[>+~:\s]/.test(unsupported)) continue;
      const classes = [...clean.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
      const id = clean.match(/#([\w-]+)/)?.[1];
      if (!classes.length && !id) continue;
      result.push({ classes, id, declarations });
    }
  }
  return result;
}

function parseLayout(source: string, styleSource: string): Node {
  const doc = parsePanoramaDocument(source);
  const styles = parseStyles(styleSource);
  const supported = new Set<Kind>(['Panel','Label','Image','Button']);
  const roots = [...doc.documentElement.children].filter(element => supported.has(element.tagName as Kind));

  function convert(element: Element): Node {
    const kind = element.tagName as Kind;
    const uid = nextUid++;
    const id = element.getAttribute('id') || `${kind}${uid}`;
    const className = element.getAttribute('class') || `${kind}${uid}`;
    const attributes: Record<string, string> = {};
    for (const attribute of [...element.attributes]) {
      if (!['id','class','text','src'].includes(attribute.name)) attributes[attribute.name] = attribute.value;
    }
    const classTokens = new Set(className.split(/\s+/).filter(Boolean));
    const mergedStyles: Record<string, string> = {};
    // Inline declarations are valid in Panorama layouts and must win over
    // stylesheet rules, just as they do in the engine.
    for (const rule of styles) {
      if ((!rule.id || rule.id === id) && rule.classes.every(token => classTokens.has(token)))
        Object.assign(mergedStyles, rule.declarations);
    }
    const inlineSources = [element.getAttribute('style') || '', element.getAttribute('styles') || ''].filter(value => value.includes(':'));
    const inline = parseDeclarations(inlineSources.join(';'));
    Object.assign(mergedStyles, inline);
    return {
      uid, kind, id, className,
      text: element.getAttribute('text') || undefined,
      src: element.getAttribute('src') || undefined,
      attributes,
      styles: mergedStyles,
      children: [...element.children].filter(child => supported.has(child.tagName as Kind)).map(convert)
    };
  }

  if (roots.length === 1) return convert(roots[0]);
  const uid = nextUid++;
  return {uid, kind:'Panel', id:'EditorDocument', className:'EditorDocument', attributes:{}, styles:{width:'100%',height:'100%',position:'0px 0px 0px'}, children:roots.map(convert)};
}

function fallbackNode(): Node {
  const uid = nextUid++;
  return {uid,kind:'Panel',id:'EditorRoot',className:'EditorRoot',attributes:{},styles:{width:'100%',height:'100%',position:'0px 0px 0px'},children:[]};
}
function find(node: Node, uid: number): Node | undefined { if (node.uid === uid) return node; for (const child of node.children) { const hit = find(child, uid); if (hit) return hit; } }
function update(node: Node, uid: number, fn: (node: Node) => Node): Node { return node.uid === uid ? fn(node) : {...node, children:node.children.map(child => update(child, uid, fn))}; }
function remove(node: Node, uid: number): Node { return {...node, children:node.children.filter(child => child.uid !== uid).map(child => remove(child, uid))}; }
function escapeXml(value: string) { return value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function toVxml(node: Node, depth = 1): string {
  const pad = '  '.repeat(depth);
  const attrs = [`id="${escapeXml(node.id)}"`, `class="${escapeXml(node.className)}"`];
  for (const [key, value] of Object.entries(node.attributes)) attrs.push(`${key}="${escapeXml(value)}"`);
  if (node.kind === 'Label') attrs.push(`text="${escapeXml(node.text || '')}"`);
  if (node.kind === 'Image') attrs.push(`src="${escapeXml(node.src || '')}"`);
  const children = node.children.map(child => toVxml(child, depth + 1));
  if (node.kind === 'Button' && node.text) children.unshift(`${'  '.repeat(depth + 1)}<Label text="${escapeXml(node.text)}" />`);
  if (!children.length) return `${pad}<${node.kind} ${attrs.join(' ')} />`;
  return `${pad}<${node.kind} ${attrs.join(' ')}>\n${children.join('\n')}\n${pad}</${node.kind}>`;
}
function toVcss(node: Node): string[] { return [`.${node.className.split(/\s+/)[0]} {\n${Object.entries(node.styles).map(([key,value]) => `  ${key}: ${value};`).join('\n')}\n}`, ...node.children.flatMap(toVcss)]; }

function sourceColor(value:string){const match=value.trim().match(/#(?:[\da-f]{3,8})/i);return match?.[0] || value.trim();}
function sourceGradient(value:string){
  if(!/^gradient\(/i.test(value.trim()))return undefined;
  const colors=[...value.matchAll(/(?:from|to)\s*\(\s*((?:#[\da-f]{3,8}|rgba?\([^)]*\)))|color-stop\s*\([^,]+,\s*((?:#[\da-f]{3,8}|rgba?\([^)]*\)))/gi)]
    .map(match => match[1] || match[2]);
  if(colors.length<2)return undefined;
  const radial=/gradient\(\s*radial/i.test(value);
  return `${radial?'radial':'linear'}-gradient(${radial?'circle':'to bottom'}, ${colors.join(', ')})`;
}
function sourceShadow(value:string,text=false){
  const tokens=value.trim().replace(/^(?:hollow|fill|inset)\s+/i,'').match(/#[\da-f]{3,8}|-?[\d.]+(?:px)?/gi);
  if(!tokens||tokens.length<4)return undefined;
  const colorToken=tokens.find(token=>token.startsWith('#'));
  const lengths=tokens.filter(token=>!token.startsWith('#')).slice(0,text?3:4).map(token=>/^[-\d.]+$/.test(token)?`${token}px`:token);
  return colorToken?[...lengths,colorToken].join(' '):undefined;
}
type BrowserStyleContext = { parentFlow?: string; absoluteIfNoFlow?: boolean };

function panoramaLength(value: string, fallbackUnit = 'px') {
  const token = value.trim();
  if (!token) return `0${fallbackUnit}`;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) return `${token}${fallbackUnit}`;
  return token;
}

function panoramaLengths(value: string, count?: number) {
  const tokens = value.trim().split(/\s+/).filter(Boolean).map(token => panoramaLength(token));
  while (count && tokens.length < count) tokens.push('0px');
  return count ? tokens.slice(0, count).join(' ') : tokens.slice(0, 4).join(' ');
}

function dimensionValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'fit-children') return 'fit-content';
  if (normalized === 'fill-parent-flow' || /^fill-parent-flow\s*\(/.test(normalized)) return '100%';
  if (normalized === 'auto') return 'auto';
  return panoramaLength(value);
}

function flowAxis(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('up') || normalized.startsWith('down') ? 'column' : normalized.startsWith('left') || normalized.startsWith('right') ? 'row' : 'none';
}

function flexAlignment(value: string) {
  return value === 'top' || value === 'left' ? 'flex-start' : value === 'bottom' || value === 'right' ? 'flex-end' : value === 'center' ? 'center' : value;
}

function zValue(value: string) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function browserStyle(styles: Record<string, string>, showAllLayers = false, context: BrowserStyleContext = {}): CSSProperties {
  const out: Record<string, string | number> = { display: 'block' };
  let horizontal = '';
  let vertical = '';
  let authoredTransform = '';
  let combinedAlignment = false;
  let authoredPosition = false;
  let hasOffset = false;
  let transformOriginZ = '';
  const filters: string[] = [];
  let backgroundBlur = '';
  const parentFlowKnown = context.parentFlow !== undefined;
  const parentFlow = context.parentFlow?.trim().toLowerCase() || 'none';
  const parentAxis = flowAxis(parentFlow);

  for (const [rawKey, rawValue] of Object.entries(styles)) {
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim();
    if (!value) continue;
    if (key === 'flow-children') {
      const normalized = value.toLowerCase();
      if (flowAxis(normalized) === 'none') out.display = 'block';
      else {
        out.display = 'flex';
        out.flexDirection = normalized.startsWith('down') ? 'column' : normalized.startsWith('up') ? 'column-reverse' : normalized.startsWith('left') ? 'row-reverse' : 'row';
        out.alignItems = 'stretch';
        if (normalized.endsWith('wrap')) out.flexWrap = 'wrap';
      }
    } else if (key === 'horizontal-align') horizontal = value.toLowerCase();
    else if (key === 'vertical-align') vertical = value.toLowerCase();
    else if (key === 'align') {
      const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
      horizontal = parts[0] || '';
      vertical = parts[1] || '';
      combinedAlignment = true;
    } else if (key === 'position') {
      const [left = '0', top = '0', z = '0'] = value.split(/\s+/);
      out.position = 'absolute';
      out.left = panoramaLength(left);
      out.top = panoramaLength(top);
      const parsedZ = zValue(z);
      if (parsedZ !== undefined) out.zIndex = parsedZ;
      authoredPosition = true;
    } else if (key === 'x') {
      out.position = 'absolute';
      out.left = panoramaLength(value);
      hasOffset = true;
    } else if (key === 'y') {
      out.position = 'absolute';
      out.top = panoramaLength(value);
      hasOffset = true;
    } else if (key === 'z') {
      const parsedZ = zValue(value);
      if (parsedZ !== undefined) out.zIndex = parsedZ;
      hasOffset = true;
    } else if (key === 'z-index') {
      const parsedZ = zValue(value);
      out.zIndex = parsedZ === undefined ? value : parsedZ;
    } else if (key === 'ignore-parent-flow') {
      if (/^(?:true|1|yes)$/i.test(value)) {
        out.position = 'absolute';
        authoredPosition = true;
      }
    } else if (key === 'layout-position') {
      // A fixed Panorama panel is still fixed to the HUD canvas in this preview.
      if (value.toLowerCase() === 'fixed') out.position = 'absolute';
    } else if (key === 'width' || key === 'height' || key === 'min-width' || key === 'min-height' || key === 'max-width' || key === 'max-height') {
      const reactKey = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      out[reactKey] = dimensionValue(value);
      if (key === 'width' && /^fill-parent-flow(?:\s*\(|$)/i.test(value) && parentAxis === 'row') out.flex = '1 1 0%';
      if (key === 'height' && /^fill-parent-flow(?:\s*\(|$)/i.test(value) && parentAxis === 'column') out.flex = '1 1 0%';
    } else if (key === 'font-size') out.fontSize = panoramaLength(value);
    else if (key === 'line-height') out.lineHeight = panoramaLength(value);
    else if (key === 'margin' || key === 'padding') out[key] = panoramaLengths(value);
    else if (/^(?:margin|padding)-(?:top|right|bottom|left)$/.test(key)) out[key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = panoramaLength(value);
    else if (key === 'border-radius' || /^(?:border)-(?:top|right|bottom|left)-(?:width|radius)$/.test(key)) out[key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = panoramaLengths(value);
    else if (key === 'wash-color') out['--panorama-wash-color'] = sourceColor(value);
    else if (key === 'pre-transform-scale2d') out.scale = value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    else if (key === 'pre-transform-rotate2d') authoredTransform = `${authoredTransform} rotate(${panoramaLength(value, 'deg')})`.trim();
    else if (key === 'transform') authoredTransform = value;
    else if (key === 'transform-origin') out.transformOrigin = value;
    else if (key === 'transform-origin-z') transformOriginZ = panoramaLength(value);
    else if (key === 'background-color') {
      const gradientStart = value.search(/gradient\(/i);
      const gradient = gradientStart >= 0 ? sourceGradient(value.slice(gradientStart)) : undefined;
      if (gradient) {
        out.backgroundImage = gradient;
        const base = value.match(/^\s*(#[\da-f]{3,8}|rgba?\([^)]*\))/i);
        if (base) out.backgroundColor = sourceColor(base[1]);
      } else out.backgroundColor = sourceColor(value);
    } else if (key === 'background-image') {
      const urls = [...value.matchAll(/url\(\s*["']?([^\)"']+)["']?\s*\)/gi)].map(match => match[1]).filter(url => /^(?:https?:|data:|\/|\.\.?\/)/i.test(url));
      if (urls.length) out.backgroundImage = urls.map(url => `url("${url}")`).join(',');
    } else if (key === 'background-position') out.backgroundPosition = value;
    else if (key === 'background-size') out.backgroundSize = value.replace(/\bcontains\b/gi, 'contain');
    else if (key === 'background-repeat') out.backgroundRepeat = value;
    else if (key === 'box-shadow') { const shadow = sourceShadow(value); if (shadow) out.boxShadow = shadow; }
    else if (key === 'text-shadow') { const shadow = sourceShadow(value, true); if (shadow) out.textShadow = shadow; }
    else if (key === 'blur') { const match = value.match(/gaussian\(\s*([\d.]+)/i); if (match) filters.push(`blur(${match[1]}px)`); }
    else if (key === 'background-blur') { const match = value.match(/gaussian\(\s*([\d.]+)/i); if (match) backgroundBlur = `blur(${match[1]}px)`; }
    else if (key === 'ui-scale' || key === 'ui-scale-x' || key === 'ui-scale-y') out.scale = value.replace(/,/g, ' ');
    else if (key === 'saturation') filters.push(`saturate(${value})`);
    else if (key === 'hue-rotation') filters.push(`hue-rotate(${panoramaLength(value, 'deg')})`);
    else if (key === 'brightness') filters.push(`brightness(${value})`);
    else if (key === 'contrast') filters.push(`contrast(${value})`);
    else if (key === 'visibility') out.visibility = value.toLowerCase() === 'collapse' ? 'hidden' : value;
    else if (key === 'overflow') {
      const tokens = value.toLowerCase().split(/\s+/);
      out.overflow = tokens.includes('scroll') ? 'auto' : tokens.includes('clip') ? 'hidden' : 'visible';
    } else if (key === 'text-overflow') {
      const normalized = value.toLowerCase();
      out.textOverflow = normalized.includes('ellipsis') ? 'ellipsis' : 'clip';
      if (normalized.includes('noclip')) out.overflow = 'visible';
    }
    else if (key === 'transition') out.transition = value.replace(/wash-color/g, 'background-color');
    else {
      const reactKey = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      const supported = new Set(['border','borderRadius','backgroundColor','color','fontFamily','fontWeight','opacity','textAlign','textOverflow','overflow','whiteSpace','letterSpacing','wordBreak','flexBasis','flexGrow','flexShrink','gap','rowGap','columnGap']);
      if (supported.has(reactKey)) out[reactKey] = value;
    }
  }

  if (transformOriginZ) out.transformOrigin = `${out.transformOrigin || '50% 50%'} ${transformOriginZ}`;
  const alignmentTransforms: string[] = [];
  const shouldAbsolute = authoredPosition || hasOffset || combinedAlignment || (parentFlowKnown && parentAxis === 'none' && Boolean(horizontal || vertical)) || Boolean(context.absoluteIfNoFlow && !authoredPosition && !hasOffset && !combinedAlignment && !horizontal && !vertical);
  if (shouldAbsolute && (combinedAlignment || horizontal || vertical || context.absoluteIfNoFlow)) {
    out.position = 'absolute';
    if (horizontal === 'center') { out.left = '50%'; alignmentTransforms.push('translateX(-50%)'); }
    else if (horizontal === 'right') out.right = '0px';
    else if (horizontal === 'left') out.left = '0px';
    else if (!('left' in out) && !('right' in out)) out.left = '0px';
    if (vertical === 'center') { out.top = '50%'; alignmentTransforms.push('translateY(-50%)'); }
    else if (vertical === 'bottom') out.bottom = '0px';
    else if (vertical === 'top') out.top = '0px';
    else if (!('top' in out) && !('bottom' in out)) out.top = '0px';
  } else if (authoredPosition && !('left' in out) && !('right' in out) && !('top' in out) && !('bottom' in out)) {
    out.left = '0px';
    out.top = '0px';
  } else if (parentAxis === 'row') {
    if (horizontal === 'right') out.marginLeft = out.marginLeft || 'auto';
    else if (horizontal === 'center') { out.marginLeft = out.marginLeft || 'auto'; out.marginRight = out.marginRight || 'auto'; }
    if (vertical) out.alignSelf = flexAlignment(vertical);
  } else if (parentAxis === 'column') {
    if (vertical === 'bottom') out.marginTop = out.marginTop || 'auto';
    else if (vertical === 'center') { out.marginTop = out.marginTop || 'auto'; out.marginBottom = out.marginBottom || 'auto'; }
    if (horizontal) out.alignSelf = flexAlignment(horizontal);
  } else if (horizontal || vertical) {
    // The standalone source preview does not know the parent flow direction;
    // keep the authored alignment available to a flex parent instead of
    // inventing an absolute anchor.
    out.alignSelf = flexAlignment(vertical || horizontal);
  }
  if (authoredTransform || alignmentTransforms.length) out.transform = [...alignmentTransforms, authoredTransform].filter(Boolean).join(' ');
  if (filters.length) out.filter = filters.join(' ');
  if (backgroundBlur) out.backdropFilter = backgroundBlur;
  if (showAllLayers) {
    if (styles.visibility?.toLowerCase() === 'collapse') out.visibility = 'visible';
    if (styles.opacity !== undefined && Number.parseFloat(styles.opacity) === 0) out.opacity = 1;
  }
  return out as CSSProperties;
}

function CanvasNode({node,selected,onSelect,showAllLayers,parentFlow='none',absoluteIfNoFlow=false}:{node:Node;selected:number;onSelect:(uid:number)=>void;showAllLayers:boolean;parentFlow?:string;absoluteIfNoFlow?:boolean}) {
  const ownFlow = node.styles['flow-children'] || 'none';
  // Only an authored box establishes a containing frame for non-flowing
  // children. Alignment alone does not: an auto-sized alert/panel must still
  // grow around its label content.
  const hasFrame = Boolean(node.styles.width || node.styles.height || node.styles.position || node.styles.x || node.styles.y || node.styles['ignore-parent-flow']);
  const style = browserStyle(node.styles, showAllLayers, {parentFlow, absoluteIfNoFlow});
  if (node.kind === 'Image') {
    const textureWidth = Number.parseFloat(node.attributes.texturewidth || '');
    const textureHeight = Number.parseFloat(node.attributes.textureheight || '');
    if (style.width === undefined && Number.isFinite(textureWidth) && textureWidth > 0) style.width = `${textureWidth}px`;
    if (style.height === undefined && Number.isFinite(textureHeight) && textureHeight > 0) style.height = `${textureHeight}px`;
  }
  const common = {'data-editor-uid':node.uid,'data-wash-color':node.styles['wash-color']||undefined,'data-panorama-flow':ownFlow,style,className:`editor-node ${node.className} ${node.id==='EditorDocument'?'editor-document ':''}${selected===node.uid?'is-selected':''}`};
  const children = node.children.map(child => <CanvasNode key={child.uid} node={child} selected={selected} onSelect={onSelect} showAllLayers={showAllLayers} parentFlow={ownFlow} absoluteIfNoFlow={ownFlow.toLowerCase()==='none' && hasFrame}/>);
  if (node.kind === 'Label') return <span {...common}>{node.text || 'Label'}</span>;
  if (node.kind === 'Image') return <div {...common} role="img" aria-label={node.id}>Image<br/><small>{node.src || 'No source'}</small></div>;
  if (node.kind === 'Button') return <button {...common}>{node.text || 'Button'}{children}</button>;
  return <div {...common}>{children}</div>;
}
function Tree({node,selected,onSelect}:{node:Node;selected:number;onSelect:(uid:number)=>void}) {
  return <li><button className={selected===node.uid?'active':''} onClick={()=>onSelect(node.uid)}>{node.kind} #{node.id}</button>{node.children.length>0&&<ul>{node.children.map(child=><Tree key={child.uid} node={child} selected={selected} onSelect={onSelect}/>)}</ul>}</li>;
}

export function PanoramaEditor({sourceName,sourceLayout,sourceStyles,onOutputChange}:{sourceName:string;sourceLayout:string;sourceStyles:string;onOutputChange?:(output:EditorOutput)=>void}) {
  const parsed = useMemo(() => { try { return {node:parseLayout(sourceLayout,sourceStyles),error:''}; } catch (error) { return {node:fallbackNode(),error:error instanceof Error?error.message:String(error)}; } }, [sourceLayout,sourceStyles]);
  const [history,setHistory] = useState<{past:Node[];present:Node;future:Node[]}>({past:[],present:parsed.node,future:[]});
  const root=history.present;
  const [selected,setSelected] = useState(parsed.node.uid);
  const [property,setProperty] = useState('width');
  const [value,setValue] = useState(valueRules.width.initial);
  const [viewport,setViewport] = useState(viewports[0]);
  const [showAllLayers,setShowAllLayers] = useState(true);
  const [showMapWallpaper,setShowMapWallpaper] = useState(true);
  const [mapTheme,setMapTheme] = useState<'dark'|'bright'>('dark');
  const [zoom,setZoom] = useState(0.5);
  const [metrics,setMetrics] = useState<CanvasMetrics|null>(null);
  const canvasWrapRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLDivElement>(null);
  const selectionCycle=useRef<{key:string;index:number}>({key:'',index:0});
  useEffect(() => { setHistory({past:[],present:parsed.node,future:[]}); setSelected(parsed.node.uid); }, [parsed]);
  const current = find(root,selected) || root;
  const output = useMemo(() => ({xml:`<root>\n${toVxml(root)}\n</root>`,css:toVcss(root).join('\n\n')}),[root]);
  useEffect(() => { onOutputChange?.(output); }, [onOutputChange,output]);
  const commit=useCallback((change:(node:Node)=>Node)=>setHistory(state=>{const next=change(state.present);return next===state.present?state:{past:[...state.past,state.present].slice(-100),present:next,future:[]}}),[]);
  const undo=useCallback(()=>setHistory(state=>state.past.length?{past:state.past.slice(0,-1),present:state.past[state.past.length-1],future:[state.present,...state.future]}:state),[]);
  const redo=useCallback(()=>setHistory(state=>state.future.length?{past:[...state.past,state.present].slice(-100),present:state.future[0],future:state.future.slice(1)}:state),[]);
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(!(event.ctrlKey||event.metaKey))return;const key=event.key.toLowerCase();if(key==='z'){event.preventDefault();event.shiftKey?redo():undo()}else if(key==='y'){event.preventDefault();redo()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[redo,undo]);
  useLayoutEffect(()=>{const wrap=canvasWrapRef.current;if(!wrap)return;const measure=()=>setZoom(Math.min(1,Math.max(0.1,(wrap.clientWidth-40)/viewport.width)));measure();const observer=new ResizeObserver(measure);observer.observe(wrap);return()=>observer.disconnect()},[viewport]);
  useLayoutEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;let frame=0;const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const target=canvas.querySelector<HTMLElement>(`[data-editor-uid="${selected}"]`);if(!target){setMetrics(null);return}const canvasRect=canvas.getBoundingClientRect();const targetRect=target.getBoundingClientRect();const scale=canvasRect.width/viewport.width||zoom;setMetrics({x:(targetRect.left-canvasRect.left)/scale,y:(targetRect.top-canvasRect.top)/scale,width:targetRect.width/scale,height:targetRect.height/scale})})};measure();const observer=new ResizeObserver(measure);observer.observe(canvas);const target=canvas.querySelector<HTMLElement>(`[data-editor-uid="${selected}"]`);if(target)observer.observe(target);return()=>{cancelAnimationFrame(frame);observer.disconnect()}},[root,selected,viewport,zoom]);
  function pickCanvasLayer(event:React.MouseEvent<HTMLDivElement>){
    const candidates=[...new Set(Array.from(document.elementsFromPoint(event.clientX,event.clientY)).map(element=>element.closest<HTMLElement>('[data-editor-uid]')).filter((element):element is HTMLElement=>Boolean(element&&canvasRef.current?.contains(element))).map(element=>Number(element.dataset.editorUid)).filter(Number.isFinite))];
    if(!candidates.length)return;
    const key=`${Math.round(event.clientX)}:${Math.round(event.clientY)}:${candidates.join(',')}`;
    const index=selectionCycle.current.key===key?(selectionCycle.current.index+1)%candidates.length:0;
    selectionCycle.current={key,index};setSelected(candidates[index]);
  }
  function patch(fields: Partial<Node>) { commit(rootNode => update(rootNode,selected,node => ({...node,...fields}))); }
  function add(kind: Kind) { const uid=nextUid++; const child:Node={uid,kind,id:`${kind}${uid}`,className:`${kind}${uid}`,text:kind==='Label'?`Label ${uid}`:kind==='Button'?`Button ${uid}`:undefined,src:kind==='Image'?'s2r://panorama/images/...vtex':undefined,attributes:{},styles:{},children:[]}; const parent=current.kind==='Panel'||current.kind==='Button'?selected:root.uid; commit(rootNode=>update(rootNode,parent,node=>({...node,children:[...node.children,child]}))); setSelected(uid); }

  return <section className="panorama-editor">
    <header><div><h1>Panorama Layout Editor</h1><p>{sourceName} · automatically loaded with its VCSS source</p></div><div className="toolbar"><button onClick={undo} disabled={!history.past.length} title="Undo (Ctrl+Z)">↶ Undo</button><button onClick={redo} disabled={!history.future.length} title="Redo (Ctrl+Y)">↷ Redo</button>{(['Panel','Label','Image','Button'] as Kind[]).map(kind=><button key={kind} onClick={()=>add(kind)}>+ {kind}</button>)}<button disabled={selected===root.uid} onClick={()=>{commit(rootNode=>remove(rootNode,selected));setSelected(root.uid)}}>Delete</button></div></header>
    {parsed.error && <div className="parse-error">{parsed.error}</div>}
    <div className="editor-grid">
      <nav className="tree"><h2>Hierarchy</h2><ul><Tree node={root} selected={selected} onSelect={setSelected}/></ul></nav>
      <div className="canvas-wrap" ref={canvasWrapRef}><div className="canvas-controls"><label>In-game reference<select value={`${viewport.width}x${viewport.height}`} onChange={event=>setViewport(viewports.find(item=>`${item.width}x${item.height}`===event.target.value)||viewports[0])}>{viewports.map(item=><option key={item.label} value={`${item.width}x${item.height}`}>{item.label}</option>)}</select></label><label className="layer-toggle"><input type="checkbox" checked={showAllLayers} onChange={event=>setShowAllLayers(event.target.checked)}/> Show all layers</label><label className="layer-toggle"><input type="checkbox" checked={showMapWallpaper} onChange={event=>setShowMapWallpaper(event.target.checked)}/> Map wallpaper</label><button type="button" className="map-theme-toggle" aria-pressed={mapTheme==='bright'} onClick={()=>setMapTheme(theme=>theme==='dark'?'bright':'dark')} title="Switch between the supplied dark and bright CS2 map wallpapers">Bright/Dark Map theme</button><span className="map-theme-status">{mapTheme==='dark'?'Dark · mnight.jpg':'Bright · dust2.jpg'}</span><output>{Math.round(zoom*100)}% workspace scale</output></div><div className="canvas-stage" style={{width:viewport.width*zoom,height:viewport.height*zoom}}><div className={`canvas reference-canvas${showMapWallpaper?' map-wallpaper':''}${showAllLayers?' show-all-layers':''} map-theme-${mapTheme}`} ref={canvasRef} onClick={pickCanvasLayer} style={{width:viewport.width,height:viewport.height,transform:`scale(${zoom})`}}><CanvasNode node={root} selected={selected} onSelect={setSelected} showAllLayers={showAllLayers}/>{metrics&&<div className="coordinate-overlay" style={{left:metrics.x,top:metrics.y,width:metrics.width,height:metrics.height}}><span>{Math.round(metrics.x)}, {Math.round(metrics.y)} · {Math.round(metrics.width)} × {Math.round(metrics.height)}</span></div>}</div></div></div>
      <aside className="inspector"><h2>Inspector</h2><section className="coordinate-card"><h3>Viewport location</h3>{metrics?<><div className="coordinate-grid"><span>X <strong>{metrics.x.toFixed(1)}px</strong></span><span>Y <strong>{metrics.y.toFixed(1)}px</strong></span><span>W <strong>{metrics.width.toFixed(1)}px</strong></span><span>H <strong>{metrics.height.toFixed(1)}px</strong></span><span>Right <strong>{(viewport.width-metrics.x-metrics.width).toFixed(1)}px</strong></span><span>Bottom <strong>{(viewport.height-metrics.y-metrics.height).toFixed(1)}px</strong></span></div><p>{(metrics.x/viewport.width*100).toFixed(2)}% from left · {(metrics.y/viewport.height*100).toFixed(2)}% from top</p></>:<p>Select a visible component to measure it.</p>}<small>Browser geometry against the selected reference canvas. Compare a CS2 capture before treating it as engine-verified.</small></section><label>ID<input value={current.id} onChange={event=>patch({id:event.target.value})}/></label><label>Class<input value={current.className} onChange={event=>patch({className:event.target.value})}/></label>{(current.kind==='Label'||current.kind==='Button')&&<label>Text<input value={current.text||''} onChange={event=>patch({text:event.target.value})}/></label>}{current.kind==='Image'&&<label>Source<input value={current.src||''} onChange={event=>patch({src:event.target.value})}/></label>}<h3>VCSS</h3><div className="style-add"><select value={property} onChange={event=>{const next=event.target.value;setProperty(next);setValue(valueRules[next]?.initial||'')}}>{styleOptions.map(option=><option key={option}>{option}</option>)}</select>{valueRules[property]?.choices?<select value={value} onChange={event=>setValue(event.target.value)}>{valueRules[property].choices!.map(choice=><option key={choice}>{choice}</option>)}</select>:<input value={value} onChange={event=>setValue(event.target.value)} onBlur={event=>setValue(normalizeVcssValue(property,event.target.value))} placeholder={valueRules[property]?.initial||'value'}/>}<button onClick={()=>{const formatted=normalizeVcssValue(property,value);setValue(formatted);patch({styles:{...current.styles,[property]:formatted}})}}>Apply</button></div><small className="value-hint">{valueRules[property]?.hint}</small>{Object.entries(current.styles).map(([key,styleValue])=><div className="style-row" key={key}><code>{key}</code><input value={styleValue} onChange={event=>patch({styles:{...current.styles,[key]:event.target.value}})} onBlur={event=>{const formatted=normalizeVcssValue(key,event.target.value);if(formatted!==event.target.value)patch({styles:{...current.styles,[key]:formatted}})}}/><button onClick={()=>{const styles={...current.styles};delete styles[key];patch({styles})}}>×</button></div>)}</aside>
    </div>
    <details className="generated"><summary>Generated panel tree and VCSS</summary><div><section><h3>VXML</h3><pre>{output.xml}</pre></section><section><h3>VCSS</h3><pre>{output.css}</pre></section></div></details>
  </section>;
}

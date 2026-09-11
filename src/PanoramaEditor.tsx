import React, { CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parsePanoramaDocument } from './panoramaFiles';
import type { PanoramaLayoutFile } from './panoramaFiles';
import { normalizeVcssValue, styleGroups, valueRules } from './vcssValues';

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
export type EditorOutput = { xml: string; css: string; dirty: boolean; touched: boolean };
export type LayoutInsertRequest = {key:number;name:string;layout:string;styles:string};
type Viewport = {width:number;height:number;label:string};
type CanvasMetrics = {x:number;y:number;width:number;height:number};
export type CanvasPan = {x:number;y:number};
type PanGesture = {pointerId:number;startX:number;startY:number;origin:CanvasPan;moved:boolean};
type FloatingGesture = {pointerId:number;startX:number;startY:number;origin:{x:number;y:number}};
type ResizeGesture = {pointerId:number;startX:number;startY:number;origin:{width:number;height:number};minWidth:number;minHeight:number;maxWidth:number;maxHeight:number};
export type TreeDropPosition = 'before' | 'inside' | 'after';
const viewports:Viewport[]=[{width:1920,height:1080,label:'1920 × 1080 (16:9)'},{width:2560,height:1440,label:'2560 × 1440 (16:9)'},{width:3440,height:1440,label:'3440 × 1440 (ultrawide)'},{width:1280,height:720,label:'1280 × 720 (16:9)'}];

export function clampCanvasPan(next:CanvasPan,frameWidth:number,frameHeight:number,stageWidth:number,stageHeight:number,minimumVisible=72):CanvasPan{
  const limitX=Math.max(0,(frameWidth+stageWidth)/2-minimumVisible);
  const limitY=Math.max(0,(frameHeight+stageHeight)/2-minimumVisible);
  return{x:Math.min(limitX,Math.max(-limitX,next.x)),y:Math.min(limitY,Math.max(-limitY,next.y))};
}

export function scaleCanvasPanAroundCenter(current:CanvasPan,oldZoom:number,newZoom:number):CanvasPan{
  if(!Number.isFinite(oldZoom)||oldZoom<=0||!Number.isFinite(newZoom))return current;
  const ratio=newZoom/oldZoom;
  return{x:current.x*ratio,y:current.y*ratio};
}

let nextUid = 1;

type PanoramaStyleRule = { classes: string[]; id?: string; declarations: Record<string, string> };
type PanoramaKeyframes = { name: string; source: string; frames: Array<{selector: string; declarations: Record<string, string>}> };

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

function closingBrace(source: string, openingIndex: number) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return index;
  }
  return -1;
}

function balancedVcss(source: string) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (quote) { if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '{') depth += 1;
    else if (character === '}' && --depth < 0) return false;
  }
  return depth === 0 && !quote;
}

export function extractPanoramaKeyframes(source: string): PanoramaKeyframes[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const result: PanoramaKeyframes[] = [];
  const keyframes = /@keyframes\s+(?:"([^"]+)"|'([^']+)'|([-_a-z][\w-]*))\s*\{/gi;
  let match: RegExpExecArray | null;
  while ((match = keyframes.exec(clean))) {
    const name = match[1] || match[2] || match[3];
    if (!/^[-_a-z][\w-]*$/i.test(name)) continue;
    const openingIndex = match.index + match[0].lastIndexOf('{');
    const closingIndex = closingBrace(clean, openingIndex);
    if (closingIndex < 0) break;
    const body = clean.slice(openingIndex + 1, closingIndex);
    const frames: PanoramaKeyframes['frames'] = [];
    const framePattern = /((?:(?:from|to|\d+(?:\.\d+)?%)\s*,?\s*)+)\{/gi;
    let frameMatch: RegExpExecArray | null;
    while ((frameMatch = framePattern.exec(body))) {
      const frameOpening = frameMatch.index + frameMatch[0].lastIndexOf('{');
      const frameClosing = closingBrace(body, frameOpening);
      if (frameClosing < 0) break;
      const selector = frameMatch[1].replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();
      frames.push({selector, declarations: parseDeclarations(body.slice(frameOpening + 1, frameClosing))});
      framePattern.lastIndex = frameClosing + 1;
    }
    if (frames.length) result.push({name, source: clean.slice(match.index, closingIndex + 1).trim(), frames});
    keyframes.lastIndex = closingIndex + 1;
  }
  return result;
}

function cssPropertyName(property: string) {
  if (property.startsWith('--')) return property;
  return property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

export function browserKeyframesCss(keyframes: PanoramaKeyframes[]) {
  if (!keyframes.length) return '';
  const rules = keyframes.map(animation => {
    const frames = animation.frames.map(frame => {
      const declarations = Object.entries(browserStyle(frame.declarations)).map(([property, value]) => `${cssPropertyName(property)}:${String(value)};`).join('');
      return declarations ? `${frame.selector}{${declarations}}` : '';
    }).filter(Boolean).join('');
    return frames ? `@keyframes ${animation.name}{${frames}}` : '';
  }).filter(Boolean).join('\n');
  return rules ? `@property --panorama-wash-color{syntax:"<color>";inherits:false;initial-value:transparent;}\n${rules}` : '';
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

  if (roots.length === 1 && roots[0].tagName === 'Panel') return convert(roots[0]);
  const uid = nextUid++;
  return {uid, kind:'Panel', id:'EditorDocument', className:'EditorDocument', attributes:{}, styles:{width:'100%',height:'100%',position:'0px 0px 0px'}, children:roots.map(convert)};
}

function fallbackNode(): Node {
  const uid = nextUid++;
  return {uid,kind:'Panel',id:'EditorRoot',className:'EditorRoot',attributes:{},styles:{width:'100%',height:'100%',position:'0px 0px 0px'},children:[]};
}
function find(node: Node, uid: number): Node | undefined { if (node.uid === uid) return node; for (const child of node.children) { const hit = find(child, uid); if (hit) return hit; } }
function findById(node: Node, id: string): Node | undefined { if (node.id === id) return node; for (const child of node.children) { const hit = findById(child, id); if (hit) return hit; } }
function update(node: Node, uid: number, fn: (node: Node) => Node): Node { return node.uid === uid ? fn(node) : {...node, children:node.children.map(child => update(child, uid, fn))}; }
function remove(node: Node, uid: number): Node { return {...node, children:node.children.filter(child => child.uid !== uid).map(child => remove(child, uid))}; }
function findParent(node: Node, uid: number): Node | undefined { for (const child of node.children) { if (child.uid === uid) return node; const hit = findParent(child, uid); if (hit) return hit; } }
function containsUid(node: Node, uid: number): boolean { return node.uid === uid || node.children.some(child => containsUid(child, uid)); }
function collectIds(node: Node, ids: Set<string>) { if (node.id) ids.add(node.id); for (const child of node.children) collectIds(child, ids); }
function uniqueCopyId(base: string, ids: Set<string>) { const stem = `${base || 'Node'}_copy`; let candidate = stem; let suffix = 2; while (ids.has(candidate)) candidate = `${stem}${suffix++}`; ids.add(candidate); return candidate; }
function cloneSubtree(node: Node, ids: Set<string>): Node { return {uid:nextUid++,kind:node.kind,id:uniqueCopyId(node.id,ids),className:node.className,text:node.text,src:node.src,attributes:{...node.attributes},styles:{...node.styles},children:node.children.map(child=>cloneSubtree(child,ids))}; }
function uniqueImportedId(base:string,ids:Set<string>){let candidate=base||'ImportedNode';if(!ids.has(candidate)){ids.add(candidate);return candidate}const stem=`${candidate}_import`;candidate=stem;let suffix=2;while(ids.has(candidate))candidate=`${stem}${suffix++}`;ids.add(candidate);return candidate}
function cloneImportedSubtree(node:Node,ids:Set<string>):Node{return{uid:nextUid++,kind:node.kind,id:uniqueImportedId(node.id,ids),className:node.className,text:node.text,src:node.src,attributes:{...node.attributes},styles:{...node.styles},children:node.children.map(child=>cloneImportedSubtree(child,ids))}}
export function nearestPanelParentUid(root:Node,uid:number):number{
  let candidate=find(root,uid);
  while(candidate&&candidate.kind!=='Panel')candidate=findParent(root,candidate.uid);
  return candidate?.uid??root.uid;
}
export function canMoveSubtree(root:Node,sourceUid:number,targetUid:number,position:TreeDropPosition):boolean{
  if(sourceUid===root.uid||sourceUid===targetUid)return false;
  const source=find(root,sourceUid);
  const target=find(root,targetUid);
  if(!source||!target||containsUid(source,targetUid))return false;
  if(position==='inside')return target.kind==='Panel';
  const targetParent=findParent(root,targetUid);
  return Boolean(targetParent&&targetParent.kind==='Panel');
}
export function moveSubtree(root:Node,sourceUid:number,targetUid:number,position:TreeDropPosition):Node{
  if(!canMoveSubtree(root,sourceUid,targetUid,position))return root;
  const source=find(root,sourceUid);
  if(!source)return root;
  const withoutSource=remove(root,sourceUid);
  if(position==='inside')return update(withoutSource,targetUid,target=>({...target,children:[...target.children,source]}));
  const targetParent=findParent(withoutSource,targetUid);
  if(!targetParent)return root;
  return update(withoutSource,targetParent.uid,parent=>{
    const targetIndex=parent.children.findIndex(child=>child.uid===targetUid);
    if(targetIndex<0)return parent;
    const insertAt=targetIndex+(position==='after'?1:0);
    return{...parent,children:[...parent.children.slice(0,insertAt),source,...parent.children.slice(insertAt)]};
  });
}

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
    else if (key === 'animation') out.animation = value.replace(/(["'])([-_a-z][\w-]*)\1/gi, '$2');
    else if (key === 'animation-name') out.animationName = value.replace(/(["'])([-_a-z][\w-]*)\1/gi, '$2');
    else if (key === 'animation-delay') out.animationDelay = value;
    else if (key === 'animation-duration') out.animationDuration = value;
    else if (key === 'animation-direction') out.animationDirection = value;
    else if (key === 'animation-fill-mode') out.animationFillMode = value;
    else if (key === 'animation-iteration-count') out.animationIterationCount = value;
    else if (key === 'animation-timing-function') out.animationTimingFunction = value;
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
  // Show authored component text at half scale for a less obstructive editor
  // overlay. Resource paths remain metadata-only in the Inspector.
  if (node.kind === 'Label') return <span {...common}><span className="editor-node-preview-text">{node.text || ''}</span></span>;
  if (node.kind === 'Image') return <div {...common} role="img" aria-label={node.id}/>;
  if (node.kind === 'Button') return <button {...common}><span className="editor-node-preview-text">{node.text || ''}</span>{children}</button>;
  return <div {...common}>{children}</div>;
}
function LayoutPresetPreview({layout}:{layout:PanoramaLayoutFile}) {
  const parsed=useMemo(()=>{try{return {node:parseLayout(layout.layout,layout.styles),error:''}}catch(error){return {node:null,error:error instanceof Error?error.message:String(error)}}},[layout.layout,layout.styles]);
  if(!parsed.node)return <span className="layout-preset-preview layout-preset-invalid">Preview unavailable</span>;
  return <span className="layout-preset-preview" aria-hidden="true"><span className="layout-preset-stage"><CanvasNode node={parsed.node} selected={-1} onSelect={()=>{}} showAllLayers/></span></span>;
}
type TreeProps = {
  node:Node; root:Node; selected:number; collapsed:Set<number>; draggedUid:number|null;
  onSelect:(uid:number)=>void; onToggle:(uid:number)=>void;
  onDragStart:(uid:number)=>void; onDragEnd:()=>void;
  onMove:(sourceUid:number,targetUid:number,position:TreeDropPosition)=>void;
};

function treeDropPosition(event:React.DragEvent<HTMLDivElement>,node:Node,rootUid:number):TreeDropPosition {
  if (node.uid === rootUid) return 'inside';
  const bounds = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return node.kind === 'Panel' ? 'inside' : 'after';
}

function Tree({node,root,selected,collapsed,draggedUid,onSelect,onToggle,onDragStart,onDragEnd,onMove}:TreeProps) {
  const [dropHint,setDropHint]=useState<TreeDropPosition|null>(null);
  const hasChildren=node.children.length>0;
  const canCollapse=node.kind==='Panel'&&hasChildren;
  const isCollapsed=collapsed.has(node.uid);
  return <li className="tree-item">
    <div
      className={`tree-row${selected===node.uid?' active':''}${draggedUid===node.uid?' is-dragging':''}${dropHint?` drop-${dropHint}`:''}`}
      draggable={node.uid!==root.uid}
      onDragStart={event=>{if(node.uid===root.uid){event.preventDefault();return}event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(node.uid));onDragStart(node.uid)}}
      onDragEnd={()=>{setDropHint(null);onDragEnd()}}
      onDragOver={event=>{if(draggedUid===null)return;const position=treeDropPosition(event,node,root.uid);if(!canMoveSubtree(root,draggedUid,node.uid,position)){setDropHint(null);return}event.preventDefault();event.dataTransfer.dropEffect='move';setDropHint(position)}}
      onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as globalThis.Node|null))setDropHint(null)}}
      onDrop={event=>{event.preventDefault();const sourceUid=draggedUid??Number(event.dataTransfer.getData('text/plain'));const position=treeDropPosition(event,node,root.uid);setDropHint(null);if(Number.isFinite(sourceUid))onMove(sourceUid,node.uid,position)}}
    >
      {canCollapse?<button type="button" className="tree-collapse" onClick={()=>onToggle(node.uid)} aria-label={`${isCollapsed?'Expand':'Collapse'} ${node.id}`} aria-expanded={!isCollapsed}>{isCollapsed?'▸':'▾'}</button>:<span className="tree-spacer"/>}
      <button type="button" className="tree-select" onClick={()=>onSelect(node.uid)} title={node.uid===root.uid?'The first Panel is fixed':`Drag to move ${node.id}`}><span>{node.kind}</span> #{node.id}</button>
    </div>
    {hasChildren&&(!canCollapse||!isCollapsed)&&<ul>{node.children.map(child=><Tree key={child.uid} node={child} root={root} selected={selected} collapsed={collapsed} draggedUid={draggedUid} onSelect={onSelect} onToggle={onToggle} onDragStart={onDragStart} onDragEnd={onDragEnd} onMove={onMove}/>)}</ul>}
  </li>;
}

export function PanoramaEditor({sourceName,sourceLayout,sourceStyles,componentLayouts,insertRequest,onInsertResult,onOutputChange}:{sourceName:string;sourceLayout:string;sourceStyles:string;componentLayouts:PanoramaLayoutFile[];insertRequest?:LayoutInsertRequest|null;onInsertResult?:(message:string)=>void;onOutputChange?:(output:EditorOutput)=>void}) {
  const parsed = useMemo(() => { try { return {node:parseLayout(sourceLayout,sourceStyles),error:''}; } catch (error) { return {node:fallbackNode(),error:error instanceof Error?error.message:String(error)}; } }, [sourceLayout,sourceStyles]);
  const [history,setHistory] = useState<{past:Node[];present:Node;future:Node[]}>({past:[],present:parsed.node,future:[]});
  const root=history.present;
  const [selected,setSelected] = useState(parsed.node.uid);
  const [property,setProperty] = useState('width');
  const [value,setValue] = useState(valueRules.width.initial);
  const [viewport,setViewport] = useState(viewports[0]);
  const [showDashedBorder,setShowDashedBorder] = useState(true);
  const [showAllLayers,setShowAllLayers] = useState(true);
  const [showMapWallpaper,setShowMapWallpaper] = useState(true);
  const [mapTheme,setMapTheme] = useState<'dark'|'bright'>('dark');
  const [showHierarchy,setShowHierarchy] = useState(true);
  const [inspectorOpen,setInspectorOpen] = useState(true);
  const [viewportLocationOpen,setViewportLocationOpen] = useState(true);
  const [inspectorPosition,setInspectorPosition] = useState<{x:number;y:number}|null>(null);
  const [inspectorSize,setInspectorSize] = useState<{width:number;height:number}|null>(null);
  const [sourceOpen,setSourceOpen] = useState(false);
  const [sourcePosition,setSourcePosition] = useState<{x:number;y:number}|null>(null);
  const [sourceSize,setSourceSize] = useState<{width:number;height:number}|null>(null);
  const [palettePosition,setPalettePosition] = useState<{x:number;y:number}|null>(null);
  const [collapsed,setCollapsed] = useState<Set<number>>(()=>new Set());
  const [draggedUid,setDraggedUid] = useState<number|null>(null);
  const [componentLibraryOpen,setComponentLibraryOpen] = useState(false);
  const [baseZoom,setBaseZoom] = useState(0.5);
  const [zoomOffset,setZoomOffset] = useState(0);
  const [pan,setPan] = useState<CanvasPan>({x:0,y:0});
  const [isPanning,setIsPanning] = useState(false);
  const [metrics,setMetrics] = useState<CanvasMetrics|null>(null);
  const [isApplying,setIsApplying] = useState(false);
  const canvasWrapRef=useRef<HTMLDivElement>(null);
  const canvasViewportRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLDivElement>(null);
  const inspectorRef=useRef<HTMLElement>(null);
  const sourceRef=useRef<HTMLElement>(null);
  const paletteRef=useRef<HTMLDivElement>(null);
  const panGesture=useRef<PanGesture|null>(null);
  const floatingGesture=useRef<FloatingGesture|null>(null);
  const sourceGesture=useRef<FloatingGesture|null>(null);
  const inspectorResizeGesture=useRef<ResizeGesture|null>(null);
  const sourceResizeGesture=useRef<ResizeGesture|null>(null);
  const paletteGesture=useRef<FloatingGesture|null>(null);
  const lastInsertKey=useRef<number|null>(null);
  const suppressCanvasClick=useRef(false);
  const selectionCycle=useRef<{key:string;index:number}>({key:'',index:0});
  const applyingTimer=useRef<number|null>(null);
  const initialKeyframes = useMemo(() => extractPanoramaKeyframes(sourceStyles), [sourceStyles]);
  const [keyframes,setKeyframes] = useState(initialKeyframes);
  useEffect(() => { setHistory({past:[],present:parsed.node,future:[]}); setSelected(parsed.node.uid); setCollapsed(new Set()); setDraggedUid(null); setComponentLibraryOpen(false); setKeyframes(initialKeyframes); }, [initialKeyframes,parsed]);
  const current = find(root,selected) || root;
  const browserAnimationStyles = useMemo(() => browserKeyframesCss(keyframes), [keyframes]);
  const zoom=Math.max(0.1,baseZoom+(zoomOffset/viewport.width));
  const output = useMemo(() => ({
    xml:`<root>\n${toVxml(root)}\n</root>`,
    css:[toVcss(root).join('\n\n'),keyframes.map(animation=>animation.source).join('\n\n')].filter(Boolean).join('\n\n'),
    dirty:root!==parsed.node,
    touched:history.past.length>0||history.future.length>0,
  }),[history.future.length,history.past.length,keyframes,parsed.node,root]);
  const [generatedXmlDraft,setGeneratedXmlDraft] = useState(output.xml);
  const [generatedCssDraft,setGeneratedCssDraft] = useState(output.css);
  const [generatedError,setGeneratedError] = useState('');
  const generatedFocus=useRef<'xml'|'css'|null>(null);
  useEffect(()=>{if(generatedFocus.current!=='xml')setGeneratedXmlDraft(output.xml);if(generatedFocus.current!=='css')setGeneratedCssDraft(output.css)},[output.css,output.xml]);
  useEffect(() => { onOutputChange?.(output); }, [onOutputChange,output]);
  const propertyNames=useMemo(()=>styleGroups.flatMap(group=>group.options),[]);
  useEffect(()=>{
    const inspector=inspectorRef.current;const select=inspector?.querySelector<HTMLSelectElement>('.style-add > select');
    if(!select||select.dataset.autocompleteReady)return;
    const input=document.createElement('input');input.className='property-search';input.placeholder='Search VCSS properties…';input.setAttribute('list','vcss-property-options');input.setAttribute('aria-label','Search VCSS properties');
    const list=document.createElement('datalist');list.id='vcss-property-options';propertyNames.forEach(name=>{const option=document.createElement('option');option.value=name;list.appendChild(option)});
    select.parentElement?.insertBefore(input,select);select.parentElement?.appendChild(list);select.dataset.autocompleteReady='true';
    const choose=()=>{const match=propertyNames.find(name=>name.toLowerCase()===input.value.trim().toLowerCase());if(match){select.value=match;select.dispatchEvent(new Event('change',{bubbles:true}))}};
    input.addEventListener('change',choose);input.addEventListener('keydown',event=>{if((event as KeyboardEvent).key==='Enter'){event.preventDefault();choose()}});
    return()=>{input.removeEventListener('change',choose);select.parentElement?.removeChild(input);list.remove();delete select.dataset.autocompleteReady};
  },[propertyNames,inspectorOpen]);
  useEffect(()=>{
    if(!sourceOpen)return;
    const frame=canvasViewportRef.current, island=frame?.querySelector<HTMLElement>('.source-code-island'), header=island?.querySelector<HTMLElement>(':scope > header');
    if(!frame||!island||!header)return;
    let drag:{x:number;y:number;left:number;top:number}|null=null;
    const down=(event:PointerEvent)=>{if(event.button!==0||(event.target as HTMLElement).closest('button,textarea'))return;const fr=frame.getBoundingClientRect(),ir=island.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:ir.left-fr.left,top:ir.top-fr.top};header.setPointerCapture(event.pointerId);event.preventDefault()};
    const move=(event:PointerEvent)=>{if(!drag)return;const maxX=Math.max(8,frame.clientWidth-island.offsetWidth-8),maxY=Math.max(8,frame.clientHeight-island.offsetHeight-8);island.style.left=`${Math.max(8,Math.min(maxX,drag.left+event.clientX-drag.x))}px`;island.style.top=`${Math.max(8,Math.min(maxY,drag.top+event.clientY-drag.y))}px`;island.style.right='auto'};
    const up=(event:PointerEvent)=>{if(!drag)return;if(header.hasPointerCapture(event.pointerId))header.releasePointerCapture(event.pointerId);drag=null};
    header.addEventListener('pointerdown',down);header.addEventListener('pointermove',move);header.addEventListener('pointerup',up);header.addEventListener('pointercancel',up);
    return()=>{header.removeEventListener('pointerdown',down);header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',up);header.removeEventListener('pointercancel',up)};
  },[sourceOpen]);
  const markApplying=useCallback(()=>{setIsApplying(true);if(applyingTimer.current!==null)window.clearTimeout(applyingTimer.current);applyingTimer.current=window.setTimeout(()=>{applyingTimer.current=null;setIsApplying(false)},350)},[]);
  useEffect(()=>()=>{if(applyingTimer.current!==null)window.clearTimeout(applyingTimer.current)},[]);
  const commit=useCallback((change:(node:Node)=>Node)=>setHistory(state=>{const next=change(state.present);if(next===state.present)return state;markApplying();return {past:[...state.past,state.present].slice(-100),present:next,future:[]}}),[markApplying]);
  useEffect(()=>{
    if(!insertRequest||lastInsertKey.current===insertRequest.key)return;
    lastInsertKey.current=insertRequest.key;
    try{
      const importedRoot=parseLayout(insertRequest.layout,insertRequest.styles);
      const ids=new Set<string>();collectIds(root,ids);
      const imported=cloneImportedSubtree(importedRoot,ids);
      const parent=nearestPanelParentUid(root,selected);
      commit(rootNode=>update(rootNode,parent,node=>({...node,children:[...node.children,imported]})));
      const importedKeyframes=extractPanoramaKeyframes(insertRequest.styles);
      if(importedKeyframes.length)setKeyframes(existing=>[...existing.filter(animation=>!importedKeyframes.some(next=>next.name===animation.name)),...importedKeyframes]);
      setCollapsed(state=>{const next=new Set(state);next.delete(parent);return next});
      setSelected(imported.uid);
      onInsertResult?.(`Inserted ${insertRequest.name} into the current layout.`);
    }catch(error){onInsertResult?.(`Could not insert ${insertRequest.name}: ${error instanceof Error?error.message:String(error)}`)}
  },[commit,insertRequest,onInsertResult,root,selected]);
  const undo=useCallback(()=>setHistory(state=>{if(!state.past.length)return state;markApplying();return {past:state.past.slice(0,-1),present:state.past[state.past.length-1],future:[state.present,...state.future]}}),[markApplying]);
  const redo=useCallback(()=>setHistory(state=>{if(!state.future.length)return state;markApplying();return {past:[...state.past,state.present].slice(-100),present:state.future[0],future:state.future.slice(1)}}),[markApplying]);
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(!(event.ctrlKey||event.metaKey))return;const key=event.key.toLowerCase();if(key==='z'){event.preventDefault();event.shiftKey?redo():undo()}else if(key==='y'){event.preventDefault();redo()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[redo,undo]);
  useLayoutEffect(()=>{const wrap=canvasWrapRef.current;if(!wrap)return;const measure=()=>setBaseZoom(Math.min(1,Math.max(0.1,(wrap.clientWidth-40)/viewport.width)));measure();const observer=new ResizeObserver(measure);observer.observe(wrap);return()=>observer.disconnect()},[viewport]);
  useLayoutEffect(()=>{setPan(current=>{const next=constrainPan(current,zoom);return next.x===current.x&&next.y===current.y?current:next})},[viewport,zoom]);
  useLayoutEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;let frame=0;const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const target=canvas.querySelector<HTMLElement>(`[data-editor-uid="${selected}"]`);if(!target){setMetrics(null);return}const canvasRect=canvas.getBoundingClientRect();const targetRect=target.getBoundingClientRect();const scale=canvasRect.width/viewport.width||zoom;setMetrics({x:(targetRect.left-canvasRect.left)/scale,y:(targetRect.top-canvasRect.top)/scale,width:targetRect.width/scale,height:targetRect.height/scale})})};measure();const observer=new ResizeObserver(measure);observer.observe(canvas);const target=canvas.querySelector<HTMLElement>(`[data-editor-uid="${selected}"]`);if(target)observer.observe(target);return()=>{cancelAnimationFrame(frame);observer.disconnect()}},[root,selected,viewport,zoom]);
  function pickCanvasLayer(event:React.MouseEvent<HTMLDivElement>){
    if(!(event.ctrlKey||event.metaKey))return;
    if(suppressCanvasClick.current){suppressCanvasClick.current=false;return}
    const candidates=[...new Set(Array.from(document.elementsFromPoint(event.clientX,event.clientY)).map(element=>element.closest<HTMLElement>('[data-editor-uid]')).filter((element):element is HTMLElement=>Boolean(element&&canvasRef.current?.contains(element))).map(element=>Number(element.dataset.editorUid)).filter(Number.isFinite))];
    if(!candidates.length)return;
    const key=`${Math.round(event.clientX)}:${Math.round(event.clientY)}:${candidates.join(',')}`;
    const index=selectionCycle.current.key===key?(selectionCycle.current.index+1)%candidates.length:0;
    selectionCycle.current={key,index};setSelected(candidates[index]);
  }
  function constrainPan(next:CanvasPan,nextZoom=zoom):CanvasPan{
    const frame=canvasViewportRef.current;
    if(!frame)return next;
    return clampCanvasPan(next,frame.clientWidth,frame.clientHeight,viewport.width*nextZoom,viewport.height*nextZoom);
  }
  function changeZoom(delta:number){
    const nextOffset=Math.min(400,Math.max(-400,zoomOffset+delta));
    if(nextOffset===zoomOffset)return;
    const nextZoom=Math.max(0.1,baseZoom+(nextOffset/viewport.width));
    setPan(current=>constrainPan(scaleCanvasPanAroundCenter(current,zoom,nextZoom),nextZoom));
    setZoomOffset(nextOffset);
  }
  function resetZoom(){
    const nextZoom=baseZoom;
    setPan(current=>constrainPan(scaleCanvasPanAroundCenter(current,zoom,nextZoom),nextZoom));
    setZoomOffset(0);
  }
  function beginPan(event:React.PointerEvent<HTMLDivElement>){
    if(event.button!==0||event.ctrlKey||event.metaKey||(event.target as HTMLElement).closest('.canvas-floating-ui'))return;
    panGesture.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin:pan,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }
  function movePan(event:React.PointerEvent<HTMLDivElement>){
    const gesture=panGesture.current;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    const deltaX=event.clientX-gesture.startX;
    const deltaY=event.clientY-gesture.startY;
    if(!gesture.moved&&Math.hypot(deltaX,deltaY)<3)return;
    gesture.moved=true;
    suppressCanvasClick.current=true;
    event.preventDefault();
    setPan(constrainPan({x:gesture.origin.x+deltaX,y:gesture.origin.y+deltaY}));
  }
  function endPan(event:React.PointerEvent<HTMLDivElement>){
    const gesture=panGesture.current;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    panGesture.current=null;
    setIsPanning(false);
    if(gesture.moved)window.setTimeout(()=>{suppressCanvasClick.current=false},0);
  }
  function beginInspectorDrag(event:React.PointerEvent<HTMLElement>){
    if(event.button!==0||(event.target as HTMLElement).closest('button,input,select,textarea'))return;
    const viewportElement=canvasViewportRef.current;
    const island=inspectorRef.current;
    if(!viewportElement||!island)return;
    const viewportRect=viewportElement.getBoundingClientRect();
    const islandRect=island.getBoundingClientRect();
    const origin=inspectorPosition??{x:islandRect.left-viewportRect.left,y:islandRect.top-viewportRect.top};
    floatingGesture.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveInspector(event:React.PointerEvent<HTMLElement>){
    const gesture=floatingGesture.current;
    const viewportElement=canvasViewportRef.current;
    const island=inspectorRef.current;
    if(!gesture||gesture.pointerId!==event.pointerId||!viewportElement||!island)return;
    const maxX=Math.max(8,viewportElement.clientWidth-island.offsetWidth-8);
    const maxY=Math.max(8,viewportElement.clientHeight-island.offsetHeight-8);
    setInspectorPosition({x:Math.max(8,Math.min(maxX,gesture.origin.x+event.clientX-gesture.startX)),y:Math.max(8,Math.min(maxY,gesture.origin.y+event.clientY-gesture.startY))});
  }
  function endInspectorDrag(event:React.PointerEvent<HTMLElement>){
    if(floatingGesture.current?.pointerId!==event.pointerId)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    floatingGesture.current=null;
  }
  function beginInspectorResize(event:React.PointerEvent<HTMLDivElement>){
    if(event.button!==0)return;
    const frame=canvasViewportRef.current, island=inspectorRef.current;
    if(!frame||!island)return;
    const frameRect=frame.getBoundingClientRect(), islandRect=island.getBoundingClientRect();
    const maxWidth=Math.max(1,frame.clientWidth-(islandRect.left-frameRect.left)-16);
    const maxHeight=Math.max(1,frame.clientHeight-(islandRect.top-frameRect.top)-16);
    inspectorResizeGesture.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin:{width:inspectorSize?.width||islandRect.width,height:inspectorSize?.height||islandRect.height},minWidth:Math.min(260,maxWidth),minHeight:Math.min(180,maxHeight),maxWidth,maxHeight};
    if(!inspectorPosition)setInspectorPosition({x:islandRect.left-frameRect.left,y:islandRect.top-frameRect.top});
    event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation();
  }
  function moveInspectorResize(event:React.PointerEvent<HTMLDivElement>){
    const gesture=inspectorResizeGesture.current;if(!gesture||gesture.pointerId!==event.pointerId)return;
    setInspectorSize({width:Math.min(gesture.maxWidth,Math.max(gesture.minWidth,gesture.origin.width+event.clientX-gesture.startX)),height:Math.min(gesture.maxHeight,Math.max(gesture.minHeight,gesture.origin.height+event.clientY-gesture.startY))});
    event.preventDefault();event.stopPropagation();
  }
  function endInspectorResize(event:React.PointerEvent<HTMLDivElement>){
    if(inspectorResizeGesture.current?.pointerId!==event.pointerId)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    inspectorResizeGesture.current=null;
  }
  function beginSourceDrag(event:React.PointerEvent<HTMLElement>){
    if(event.button!==0||(event.target as HTMLElement).closest('button,input,select,textarea'))return;
    const frame=canvasViewportRef.current,island=sourceRef.current;if(!frame||!island)return;
    const frameRect=frame.getBoundingClientRect(),islandRect=island.getBoundingClientRect();
    sourceGesture.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin:sourcePosition??{x:islandRect.left-frameRect.left,y:islandRect.top-frameRect.top}};
    event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
  }
  function moveSource(event:React.PointerEvent<HTMLElement>){
    const gesture=sourceGesture.current,frame=canvasViewportRef.current,island=sourceRef.current;if(!gesture||gesture.pointerId!==event.pointerId||!frame||!island)return;
    const maxX=Math.max(8,frame.clientWidth-island.offsetWidth-8),maxY=Math.max(8,frame.clientHeight-island.offsetHeight-8);
    setSourcePosition({x:Math.max(8,Math.min(maxX,gesture.origin.x+event.clientX-gesture.startX)),y:Math.max(8,Math.min(maxY,gesture.origin.y+event.clientY-gesture.startY))});
  }
  function endSourceDrag(event:React.PointerEvent<HTMLElement>){
    if(sourceGesture.current?.pointerId!==event.pointerId)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);sourceGesture.current=null;
  }
  function beginSourceResize(event:React.PointerEvent<HTMLDivElement>){
    if(event.button!==0)return;
    const frame=canvasViewportRef.current,island=sourceRef.current;if(!frame||!island)return;
    const frameRect=frame.getBoundingClientRect(),islandRect=island.getBoundingClientRect();
    const maxWidth=Math.max(1,frame.clientWidth-(islandRect.left-frameRect.left)-16),maxHeight=Math.max(1,frame.clientHeight-(islandRect.top-frameRect.top)-16);
    sourceResizeGesture.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin:{width:sourceSize?.width||islandRect.width,height:sourceSize?.height||islandRect.height},minWidth:Math.min(280,maxWidth),minHeight:Math.min(180,maxHeight),maxWidth,maxHeight};
    if(!sourcePosition)setSourcePosition({x:islandRect.left-frameRect.left,y:islandRect.top-frameRect.top});
    event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation();
  }
  function moveSourceResize(event:React.PointerEvent<HTMLDivElement>){
    const gesture=sourceResizeGesture.current;if(!gesture||gesture.pointerId!==event.pointerId)return;
    setSourceSize({width:Math.min(gesture.maxWidth,Math.max(gesture.minWidth,gesture.origin.width+event.clientX-gesture.startX)),height:Math.min(gesture.maxHeight,Math.max(gesture.minHeight,gesture.origin.height+event.clientY-gesture.startY))});
    event.preventDefault();event.stopPropagation();
  }
  function endSourceResize(event:React.PointerEvent<HTMLDivElement>){
    if(sourceResizeGesture.current?.pointerId!==event.pointerId)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);sourceResizeGesture.current=null;
  }
  function beginPaletteDrag(event:React.PointerEvent<HTMLDivElement>){
    if(event.button!==0)return;
    const viewportElement=canvasViewportRef.current;
    const palette=paletteRef.current;
    if(!viewportElement||!palette)return;
    const viewportRect=viewportElement.getBoundingClientRect();
    const paletteRect=palette.getBoundingClientRect();
    const origin=palettePosition??{x:paletteRect.left-viewportRect.left,y:paletteRect.top-viewportRect.top};
    paletteGesture.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function movePalette(event:React.PointerEvent<HTMLDivElement>){
    const gesture=paletteGesture.current;
    const viewportElement=canvasViewportRef.current;
    const palette=paletteRef.current;
    if(!gesture||gesture.pointerId!==event.pointerId||!viewportElement||!palette)return;
    const maxX=Math.max(8,viewportElement.clientWidth-palette.offsetWidth-8);
    const maxY=Math.max(8,viewportElement.clientHeight-palette.offsetHeight-8);
    setPalettePosition({x:Math.max(8,Math.min(maxX,gesture.origin.x+event.clientX-gesture.startX)),y:Math.max(8,Math.min(maxY,gesture.origin.y+event.clientY-gesture.startY))});
  }
  function endPaletteDrag(event:React.PointerEvent<HTMLDivElement>){
    if(paletteGesture.current?.pointerId!==event.pointerId)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    paletteGesture.current=null;
  }
  function patch(fields: Partial<Node>) { commit(rootNode => update(rootNode,selected,node => ({...node,...fields}))); }
  function add(kind: Kind) { const uid=nextUid++; const child:Node={uid,kind,id:`${kind}${uid}`,className:`${kind}${uid}`,text:kind==='Label'?`Label ${uid}`:kind==='Button'?`Button ${uid}`:undefined,src:kind==='Image'?'s2r://panorama/images/...vtex':undefined,attributes:{},styles:{},children:[]}; const parent=nearestPanelParentUid(root,selected); commit(rootNode=>update(rootNode,parent,node=>({...node,children:[...node.children,child]}))); setCollapsed(state=>{const next=new Set(state);next.delete(parent);return next}); setSelected(uid); }
  function addLayoutPreset(layout:PanoramaLayoutFile){
    try{
      const importedRoot=parseLayout(layout.layout,layout.styles);
      const ids=new Set<string>();collectIds(root,ids);
      const imported=cloneImportedSubtree(importedRoot,ids);
      const parent=nearestPanelParentUid(root,selected);
      commit(rootNode=>update(rootNode,parent,node=>({...node,children:[...node.children,imported]})));
      const importedKeyframes=extractPanoramaKeyframes(layout.styles);
      if(importedKeyframes.length)setKeyframes(existing=>[...existing.filter(animation=>!importedKeyframes.some(next=>next.name===animation.name)),...importedKeyframes]);
      setCollapsed(state=>{const next=new Set(state);next.delete(parent);return next});
      setSelected(imported.uid);
      setComponentLibraryOpen(false);
      onInsertResult?.(`Inserted ${layout.name} into the current layout.`);
    }catch(error){onInsertResult?.(`Could not insert ${layout.name}: ${error instanceof Error?error.message:String(error)}`)}
  }
  function moveHierarchyNode(sourceUid:number,targetUid:number,position:TreeDropPosition){if(!canMoveSubtree(root,sourceUid,targetUid,position))return;commit(rootNode=>moveSubtree(rootNode,sourceUid,targetUid,position));setSelected(sourceUid);if(position==='inside')setCollapsed(state=>{const next=new Set(state);next.delete(targetUid);return next});setDraggedUid(null)}
  function applyGeneratedSources(nextXml:string,nextCss:string){
    if(!balancedVcss(nextCss)){setGeneratedError('VCSS braces or quoted values are incomplete. The canvas keeps the last valid version.');return}
    try{
      const nextRoot=parseLayout(nextXml,nextCss);
      const selectedId=find(root,selected)?.id;
      commit(()=>nextRoot);
      setSelected((selectedId&&findById(nextRoot,selectedId)?.uid)||nextRoot.uid);
      setKeyframes(extractPanoramaKeyframes(nextCss));
      setGeneratedError('');
    }catch(error){setGeneratedError(`Source is not yet valid: ${error instanceof Error?error.message:String(error)}`)}
  }
  const currentParent = findParent(root, selected);
  function copySelected() {
    if (!currentParent) return;
    const source = find(root, selected);
    if (!source) return;
    const ids = new Set<string>();
    collectIds(root, ids);
    const copy = cloneSubtree(source, ids);
    commit(rootNode => update(rootNode, currentParent.uid, parent => {
      const index = parent.children.findIndex(child => child.uid === selected);
      if (index < 0) return parent;
      return {...parent, children:[...parent.children.slice(0, index + 1), copy, ...parent.children.slice(index + 1)]};
    }));
    setSelected(copy.uid);
  }

  return <section className="panorama-editor">
    {browserAnimationStyles && <style>{browserAnimationStyles}</style>}
    {parsed.error && <div className="parse-error">{parsed.error}</div>}
    <div className={`editor-grid${showHierarchy?'':' hierarchy-hidden'}`}>
      {showHierarchy&&<nav className="tree"><div className="tree-header"><h2>Hierarchy</h2><button type="button" className="hierarchy-drawer-toggle" onClick={()=>setShowHierarchy(false)} aria-label="Hide Hierarchy" title="Hide Hierarchy">☰</button></div><p className="tree-help">Drag to reorder. Drop in the middle of a Panel to nest.</p><ul><Tree node={root} root={root} selected={selected} collapsed={collapsed} draggedUid={draggedUid} onSelect={setSelected} onToggle={uid=>setCollapsed(state=>{const next=new Set(state);next.has(uid)?next.delete(uid):next.add(uid);return next})} onDragStart={setDraggedUid} onDragEnd={()=>setDraggedUid(null)} onMove={moveHierarchyNode}/></ul></nav>}
      <div className="canvas-wrap" ref={canvasWrapRef}>
        <div className="canvas-controls legacy-hidden">
          {!showHierarchy&&<button type="button" className="hierarchy-drawer-toggle" onClick={()=>setShowHierarchy(true)} aria-label="Show Hierarchy" title="Show Hierarchy">☰</button>}
          <label>In-game reference<select value={`${viewport.width}x${viewport.height}`} onChange={event=>{setViewport(viewports.find(item=>`${item.width}x${item.height}`===event.target.value)||viewports[0]);setZoomOffset(0);setPan({x:0,y:0})}}>{viewports.map(item=><option key={item.label} value={`${item.width}x${item.height}`}>{item.label}</option>)}</select></label>
          <label className="layer-toggle"><input type="checkbox" checked={showDashedBorder} onChange={event=>setShowDashedBorder(event.target.checked)}/> Show dashed border</label>
          <label className="layer-toggle"><input type="checkbox" checked={showAllLayers} onChange={event=>setShowAllLayers(event.target.checked)}/> Show all layers</label>
          <label className="layer-toggle"><input type="checkbox" checked={showMapWallpaper} onChange={event=>setShowMapWallpaper(event.target.checked)}/> Map wallpaper</label>
          <button type="button" className="map-theme-toggle" aria-pressed={mapTheme==='bright'} onClick={()=>setMapTheme(theme=>theme==='dark'?'bright':'dark')} title="Switch between the supplied dark and bright CS2 map wallpapers">Bright/Dark Map theme</button>
          <span className="map-theme-status">{mapTheme==='dark'?'Dark · mnight.jpg':'Bright · dust2.jpg'}</span>
          <output>{Math.round(zoom*100)}% workspace scale</output>
        </div>
        <div className={`canvas-viewport${isPanning?' is-panning':''}`} ref={canvasViewportRef} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} aria-label="Draggable HUD canvas viewport">
          <div ref={paletteRef} className="canvas-actions-palette canvas-floating-ui" style={palettePosition?{left:palettePosition.x,top:palettePosition.y,right:'auto'}:undefined}>
            <div className="actions-palette-handle" onPointerDown={beginPaletteDrag} onPointerMove={movePalette} onPointerUp={endPaletteDrag} onPointerCancel={endPaletteDrag} aria-label="Drag canvas actions palette" title="Drag actions palette">⠿</div>
            <div className="palette-group"><span className="palette-group-label">History</span><button type="button" className="palette-action" onClick={undo} disabled={!history.past.length}>↶ Undo</button><button type="button" className="palette-action" onClick={redo} disabled={!history.future.length}>↷ Redo</button></div>
            <div className="palette-group"><span className="palette-group-label">Add component</span>{(['Panel','Label','Image','Button'] as Kind[]).map(kind=><button type="button" className="palette-action" key={kind} onClick={()=>add(kind)}>＋ {kind}</button>)}<button type="button" className="palette-action" disabled={selected===root.uid} onClick={()=>{commit(rootNode=>remove(rootNode,selected));setSelected(root.uid)}}>⌫ Delete selected</button></div>
            <button type="button" className="palette-button component-library-trigger" aria-label="Add a HUD component" aria-expanded={componentLibraryOpen} onClick={()=>setComponentLibraryOpen(open=>!open)} title="Add a HUD component">+</button>
            <span className="palette-divider"/>
            {!showHierarchy&&<button type="button" className="palette-action palette-drawer-action" onClick={()=>setShowHierarchy(true)} aria-label="Show Hierarchy" title="Show Hierarchy">☰ Hierarchy</button>}
            <label className="palette-field">In-game reference<select value={`${viewport.width}x${viewport.height}`} onChange={event=>{setViewport(viewports.find(item=>`${item.width}x${item.height}`===event.target.value)||viewports[0]);setZoomOffset(0);setPan({x:0,y:0})}}>{viewports.map(item=><option key={item.label} value={`${item.width}x${item.height}`}>{item.label}</option>)}</select></label>
            <label className="palette-toggle"><input type="checkbox" checked={showDashedBorder} onChange={event=>setShowDashedBorder(event.target.checked)}/> Show dashed border</label>
            <label className="palette-toggle"><input type="checkbox" checked={showAllLayers} onChange={event=>setShowAllLayers(event.target.checked)}/> Show all layers</label>
            <label className="palette-toggle"><input type="checkbox" checked={showMapWallpaper} onChange={event=>setShowMapWallpaper(event.target.checked)}/> Map wallpaper</label>
            <button type="button" className="palette-action" aria-pressed={mapTheme==='bright'} onClick={()=>setMapTheme(theme=>theme==='dark'?'bright':'dark')} title="Switch between the supplied dark and bright CS2 map wallpapers">{mapTheme==='dark'?'Bright':'Dark'} map theme</button>
            <button type="button" className="palette-button" onClick={()=>changeZoom(50)} disabled={zoomOffset>=400} aria-label="Zoom in 50 units" title="Zoom in 50 units">＋</button>
            <output aria-live="polite" title="Zoom adjustment">{zoomOffset>0?'+':''}{zoomOffset}</output>
            <button type="button" className="palette-button" onClick={()=>changeZoom(-50)} disabled={zoomOffset<=-400} aria-label="Zoom out 50 units" title="Zoom out 50 units">−</button>
            <button type="button" className="palette-button" onClick={resetZoom} disabled={zoomOffset===0} aria-label="Reset zoom to zero" title="Reset zoom to zero">↺</button>
            <output className="palette-scale">{Math.round(zoom*100)}% workspace scale</output>
            <span className="palette-divider"/>
            <button type="button" className={`palette-button${inspectorOpen?' active':''}`} aria-pressed={inspectorOpen} onClick={()=>setInspectorOpen(open=>!open)} aria-label="Toggle Inspector" title="Inspector">▤</button>
            <button type="button" className={`palette-button palette-source-button${sourceOpen?' active':''}`} aria-pressed={sourceOpen} onClick={()=>setSourceOpen(open=>!open)} aria-label="Toggle Source code" title="Source code">&lt;/&gt;</button>
            {componentLibraryOpen&&<section className="component-library-menu" aria-label="Game HUD component library"><header><div><strong>Game HUD components</strong><small>{componentLayouts.length} valid Hudkit example layout{componentLayouts.length===1?'':'s'} from the source workspace</small></div><button type="button" onClick={()=>setComponentLibraryOpen(false)} aria-label="Close component library">×</button></header>{componentLayouts.length?<div className="component-library-grid">{componentLayouts.map(layout=><div className="layout-preset-card" key={layout.path} role="button" tabIndex={0} aria-label={`Insert ${layout.name}`} onClick={()=>addLayoutPreset(layout)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();addLayoutPreset(layout)}}}><LayoutPresetPreview layout={layout}/><span className="layout-preset-name">{layout.name}<small>{layout.stylePaths.length} VCSS file{layout.stylePaths.length===1?'':'s'} · click to insert</small></span></div>)}</div>:<p className="component-library-empty">No valid Hudkit layouts were found. Set the source workspace to the module's <code>.assets/workshop/panorama</code> folder.</p>}</section>}
          </div>
          {inspectorOpen&&<aside ref={inspectorRef} className="inspector-island canvas-floating-ui" style={inspectorPosition?{left:inspectorPosition.x,top:inspectorPosition.y}:undefined}><header className="inspector-island-header" onPointerDown={beginInspectorDrag} onPointerMove={moveInspector} onPointerUp={endInspectorDrag} onPointerCancel={endInspectorDrag}><h2>Inspector</h2><button type="button" onClick={()=>setInspectorOpen(false)} aria-label="Collapse Inspector" title="Collapse Inspector">×</button></header><div className="inspector-island-body"><section className={`coordinate-card inspector-coordinate-card${viewportLocationOpen?'':' is-collapsed'}`}><button type="button" className="inspector-section-toggle" onClick={()=>setViewportLocationOpen(open=>!open)} aria-expanded={viewportLocationOpen}><span>Viewport location</span><span>{viewportLocationOpen?'▾':'▸'}</span></button>{viewportLocationOpen&&(metrics?<><div className="coordinate-grid"><span>X <strong>{metrics.x.toFixed(1)}px</strong></span><span>Y <strong>{metrics.y.toFixed(1)}px</strong></span><span>W <strong>{metrics.width.toFixed(1)}px</strong></span><span>H <strong>{metrics.height.toFixed(1)}px</strong></span><span>Right <strong>{(viewport.width-metrics.x-metrics.width).toFixed(1)}px</strong></span><span>Bottom <strong>{(viewport.height-metrics.y-metrics.height).toFixed(1)}px</strong></span></div><p>{(metrics.x/viewport.width*100).toFixed(2)}% from left · {(metrics.y/viewport.height*100).toFixed(2)}% from top</p></>:<p>Select a visible component to measure it.</p>)}</section><label className="inspector-field-with-action"><span>ID</span><div className="inspector-input-action"><input value={current.id} onChange={event=>patch({id:event.target.value})}/><button type="button" className="icon-button" onClick={copySelected} disabled={!currentParent} aria-label={`Copy ${current.kind} and children`} title={currentParent ? `Copy ${current.kind} and children` : 'The document root cannot be copied'}>⧉</button></div></label><label>Class<input value={current.className} onChange={event=>patch({className:event.target.value})}/></label>{(current.kind==='Label'||current.kind==='Button')&&<label>Text<input value={current.text||''} onChange={event=>patch({text:event.target.value})}/></label>}{current.kind==='Image'&&<label>Source<input value={current.src||''} onChange={event=>patch({src:event.target.value})}/></label>}<h3>VCSS</h3><div className="style-add"><select value={property} onChange={event=>{const next=event.target.value;setProperty(next);setValue(valueRules[next]?.initial||'')}}>{styleGroups.map(group=><optgroup key={group.label} label={group.label}>{group.options.map(option=><option key={option}>{option}</option>)}</optgroup>)}</select>{(valueRules[property]?.choices&&(valueRules[property].kind==='enum'||valueRules[property].kind==='boolean'))?<select value={value} onChange={event=>setValue(event.target.value)}>{valueRules[property].choices!.map(choice=><option key={choice}>{choice}</option>)}</select>:<input value={value} onChange={event=>setValue(event.target.value)} onBlur={event=>setValue(normalizeVcssValue(property,event.target.value))} placeholder={valueRules[property]?.initial||'value'}/>}<button onClick={()=>{const formatted=normalizeVcssValue(property,value);setValue(formatted);patch({styles:{...current.styles,[property]:formatted}})}}>Apply</button></div><small className="value-hint">{valueRules[property]?.hint}</small>{Object.entries(current.styles).map(([key,styleValue])=><div className="style-row" key={key}><code>{key}</code><input value={styleValue} onChange={event=>patch({styles:{...current.styles,[key]:event.target.value}})} onBlur={event=>{const formatted=normalizeVcssValue(key,event.target.value);if(formatted!==event.target.value)patch({styles:{...current.styles,[key]:formatted}})}}/><button onClick={()=>{const styles={...current.styles};delete styles[key];patch({styles})}}>×</button></div>)}</div></aside>}
          {sourceOpen&&<section className="source-code-island canvas-floating-ui" aria-label="Source code"><header><h2>Source code</h2><button type="button" onClick={()=>setSourceOpen(false)} aria-label="Collapse Source code" title="Collapse Source code">×</button></header><div><section><h3>VXML</h3><textarea className="generated-editor" value={generatedXmlDraft} spellCheck={false} aria-label="Editable generated VXML" onFocus={()=>{generatedFocus.current='xml'}} onBlur={()=>{generatedFocus.current=null;setGeneratedXmlDraft(output.xml)}} onChange={event=>{const next=event.target.value;setGeneratedXmlDraft(next);applyGeneratedSources(next,generatedCssDraft)}}/></section><section><h3>VCSS</h3><textarea className="generated-editor" value={generatedCssDraft} spellCheck={false} aria-label="Editable generated VCSS" onFocus={()=>{generatedFocus.current='css'}} onBlur={()=>{generatedFocus.current=null;setGeneratedCssDraft(output.css)}} onChange={event=>{const next=event.target.value;setGeneratedCssDraft(next);applyGeneratedSources(generatedXmlDraft,next)}}/></section>{generatedError&&<p className="generated-error" role="status">{generatedError}</p>}</div></section>}
          <div className="canvas-stage" style={{width:viewport.width*zoom,height:viewport.height*zoom,transform:`translate(-50%, -50%) translate3d(${pan.x}px, ${pan.y}px, 0)`}}><div className={`canvas reference-canvas${showMapWallpaper?' map-wallpaper':''}${showDashedBorder?' show-dashed-border':''}${showAllLayers?' show-all-layers':''} map-theme-${mapTheme}`} ref={canvasRef} onClick={pickCanvasLayer} style={{width:viewport.width,height:viewport.height,transform:`scale(${zoom})`}}><CanvasNode node={root} selected={selected} onSelect={setSelected} showAllLayers={showAllLayers}/>{metrics&&<div className="coordinate-overlay" style={{left:metrics.x,top:metrics.y,width:metrics.width,height:metrics.height}}><span>{Math.round(metrics.x)}, {Math.round(metrics.y)} · {Math.round(metrics.width)} × {Math.round(metrics.height)}</span></div>}</div></div>
          <small className="canvas-selection-hint canvas-floating-ui">Hold Ctrl + click to select components</small>
          {isApplying&&<div className="canvas-apply-spinner canvas-floating-ui" role="status" aria-live="polite"><span className="apply-spinner" aria-hidden="true"/> Applying changes…</div>}
        </div>
      </div>
    </div>
  </section>;
}

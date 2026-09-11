import React, { useMemo } from 'react';
import { browserKeyframesCss, browserStyle, extractPanoramaKeyframes } from './PanoramaEditor';

function previewCss(vcss:string){
 const keyframes=extractPanoramaKeyframes(vcss);
 const rules=[...vcss.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>{
  if (/^\s*(?:from|to|\d+(?:\.\d+)?%)\s*(?:,|$)/i.test(selector)) return '';
  const styles:Record<string,string>={};for(const part of body.split(';')){const colon=part.indexOf(':');if(colon>0)styles[part.slice(0,colon).trim().toLowerCase()]=part.slice(colon+1).trim()}
  const browser=browserStyle(styles);const declarations=Object.entries(browser).filter(([key])=>key!=='--panorama-wash-color').map(([key,value])=>`${key.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}:${String(value).replace(/s2r:\/\/[^\s,)]*/g,'')};`).join('');
  const selectors=selector.split(',').map(item=>item.trim()).filter(Boolean);
  const wash=styles['wash-color']?`${selectors.join(',')}::after{content:"";position:absolute;z-index:9999;inset:0;pointer-events:none;background:${styles['wash-color']};mix-blend-mode:color;border-radius:inherit;}`:'';
  return `${selectors.join(',')}{${declarations}}${wash}`;
 }).join('');
 return `${rules}${browserKeyframesCss(keyframes)}`;
}
function node(el:Element,key:number):React.ReactNode{
 const attrs=Object.fromEntries([...el.attributes].map(a=>[a.name,a.value])); const children=[...el.children].map((c,i)=>node(c,i));
 if(['styles','scripts'].includes(el.tagName))return null;
 const common={id:attrs.id,className:`preview-node ${el.tagName==='root'?'preview-root ':''}${attrs.class||''}`.trim()};
 if(el.tagName==='Label')return <span key={key} {...common}>{attrs.text||''}</span>;
 if(el.tagName==='Image')return <div key={key} {...common} role="img" aria-label={attrs.id||'Panorama image'} data-source={attrs.src}>◈</div>;
 if(el.tagName==='Button')return <button key={key} {...common}>{children}</button>;
 return <div key={key} {...common} data-panorama-tag={el.tagName}>{children}</div>;
}
export function PanoramaSandbox({layout,styles}:{layout:string;styles:string}){const root=useMemo(()=>new DOMParser().parseFromString(layout,'application/xml').documentElement,[layout]);return <section className="stage"><style>{previewCss(styles)}</style>{node(root,0)}</section>}

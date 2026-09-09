export type PanoramaLayoutFile = {
  path: string;
  name: string;
  layout: string;
  stylePaths: string[];
  styleTargetPath: string;
  styles: string;
};

export type PanoramaSourceFiles = { layouts: Record<string,string>; styles: Record<string,string> };

const layoutModules = import.meta.glob('../panorama/layout/custom_game/**/*.[vV][xX][mM][lL]', {
  query: '?raw', import: 'default', eager: true
}) as Record<string, string>;

const styleModules = import.meta.glob('../panorama/styles/custom_game/**/*.[vV][cC][sS][sS]', {
  query: '?raw', import: 'default', eager: true
}) as Record<string, string>;

const slash = (value: string) => value.replace(/\\/g, '/').toLowerCase();
const basename = (value: string) => slash(value).split('/').pop() || value;
const layoutRelative = (value: string) => slash(value).split('/layout/custom_game/').pop() || basename(value);

function browserSafeVxml(layout: string): string {
  let result=''; let inTag=false; let quote='';
  for (const character of layout.replace(/^\uFEFF/,'')) {
    if (!inTag && character==='<') inTag=true;
    if (inTag && !quote && (character==='"' || character==="'")) quote=character;
    else if (inTag && quote===character) quote='';
    if (inTag && quote && character==='<') result+='&lt;'; else result+=character;
    if (inTag && !quote && character==='>') inTag=false;
  }
  return result.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/gi,'&amp;');
}

export function parsePanoramaDocument(layout: string): XMLDocument {
  const parse = (source: string) => new DOMParser().parseFromString(source.replace(/^\uFEFF/,''),'application/xml');
  let document = parse(layout);
  if (!document.querySelector('parsererror')) return document;
  document = parse(browserSafeVxml(layout));
  if (!document.querySelector('parsererror')) return document;
  throw new Error('The selected VXML contains syntax that neither the strict nor Panorama-compatible preview parser could read.');
}

function referencedStyles(layout: string): string[] {
  const refs: string[] = [];
  const pattern = /<include\b[^>]*\bsrc\s*=\s*["']([^"']+\.vcss(?:_c)?)["'][^>]*\/?>/gi;
  for (const match of layout.matchAll(pattern)) refs.push(match[1]);
  return refs;
}

function resolveStyle(ref: string, sources:Record<string,string>): string | undefined {
  const normalized = slash(ref).replace(/\.vcss_c$/i,'.vcss');
  const customRelative = normalized.split('/styles/custom_game/').pop() || basename(normalized);
  return Object.keys(sources).find(path => {
    const candidate = slash(path);
    return candidate.endsWith(`/styles/custom_game/${customRelative}`) || basename(candidate) === basename(normalized);
  });
}

export function isValidPanoramaLayout(layout: string): boolean {
  try {
    const document=parsePanoramaDocument(layout);
    if (document.documentElement.tagName.toLowerCase() !== 'root') return false;
    return [...document.documentElement.children].some(element => ['Panel','Label','Image','Button'].includes(element.tagName));
  } catch { return false; }
}

export function discoverPanoramaLayouts(layoutSources:Record<string,string>=layoutModules,styleSources:Record<string,string>=styleModules): PanoramaLayoutFile[] {
  return Object.entries(layoutSources).filter(([,layout]) => isValidPanoramaLayout(layout)).sort(([a], [b]) => a.localeCompare(b)).map(([path, layout]) => {
    const explicit = referencedStyles(layout).map(ref=>resolveStyle(ref,styleSources)).filter((value): value is string => Boolean(value));
    const relativeStyle=layoutRelative(path).replace(/\.vxml$/i,'.vcss');
    const defaultStylePath=`../panorama/styles/custom_game/${relativeStyle}`;
    const fallback=Object.keys(styleSources).find(stylePath=>slash(stylePath).endsWith(`/styles/custom_game/${relativeStyle}`)) || Object.keys(styleSources).find(stylePath=>basename(stylePath)===basename(relativeStyle));
    const stylePaths = [...new Set(explicit.length ? explicit : fallback ? [fallback] : [])];
    return {
      path,
      name: path.split('/layout/custom_game/').pop() || basename(path),
      layout,
      stylePaths,
      styleTargetPath:stylePaths[0] || defaultStylePath,
      styles: stylePaths.map(stylePath => styleSources[stylePath] || '').filter(Boolean).join('\n\n')
    };
  });
}

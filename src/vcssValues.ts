import panoramaCssReference from '../reference/panorama_css.json';

type CachedCssProperty = { description?: string };
const cachedProperties = panoramaCssReference.panorama_css.properties as Record<string, CachedCssProperty>;

export type ValueKind =
  | 'angle'
  | 'blur'
  | 'boolean'
  | 'boolean-list'
  | 'border'
  | 'color'
  | 'color-list'
  | 'duration'
  | 'duration-list'
  | 'enum'
  | 'enum-list'
  | 'length'
  | 'length-list'
  | 'length-pair'
  | 'line-height'
  | 'number'
  | 'percentage-pair'
  | 'position'
  | 'position-expression'
  | 'raw'
  | 'resource'
  | 'scale'
  | 'scale-percent'
  | 'shadow'
  | 'text'
  | 'timing-list'
  | 'transform';

export type ValueRule = {
  initial: string;
  hint: string;
  kind: ValueKind;
  choices?: readonly string[];
};

/** The bundled cache is the source of truth, so new cached properties appear automatically. */
export const styleOptions = Object.keys(cachedProperties).sort((a, b) => a.localeCompare(b));

const groupDefinitions: Array<[string, string[]]> = [
  ['Layout', ['align', 'flow-children', 'height', 'horizontal-align', 'ignore-parent-flow', 'layout-position', 'max-height', 'max-width', 'min-height', 'min-width', 'position', 'vertical-align', 'width', 'x', 'y', 'z', 'z-index']],
  ['Spacing', ['margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top']],
  ['Background & Borders', ['background-blur', 'background-color', 'background-color-opacity', 'background-image', 'background-img-opacity', 'background-position', 'background-repeat', 'background-size', 'background-texture-size', 'border', 'border-bottom', 'border-bottom-color', 'border-bottom-left-radius', 'border-bottom-right-radius', 'border-bottom-style', 'border-bottom-width', 'border-brush', 'border-color', 'border-image', 'border-image-outset', 'border-image-repeat', 'border-image-slice', 'border-image-source', 'border-image-width', 'border-left', 'border-left-color', 'border-left-style', 'border-left-width', 'border-radius', 'border-right', 'border-right-color', 'border-right-style', 'border-right-width', 'border-style', 'border-top', 'border-top-color', 'border-top-left-radius', 'border-top-right-radius', 'border-top-style', 'border-top-width', 'border-width']],
  ['Typography', ['color', 'font', 'font-family', 'font-size', 'font-stretch', 'font-style', 'font-weight', 'letter-spacing', 'line-height', 'paragraph-spacing', 'text-align', 'text-decoration', 'text-decoration-style', 'text-overflow', 'text-shadow', 'text-transform', 'white-space']],
  ['Effects & Transforms', ['-s2-mix-blend-mode', 'blur', 'box-shadow', 'brightness', 'clip', 'contrast', 'hue-rotation', 'img-shadow', 'perspective', 'perspective-origin', 'pre-transform-rotate2d', 'pre-transform-scale2d', 'saturation', 'transform', 'transform-origin', 'ui-scale', 'ui-scale-x', 'ui-scale-y', 'ui-scale-z', 'wash-color', 'world-blur']],
  ['Animation & Transitions', ['animation', 'animation-delay', 'animation-direction', 'animation-duration', 'animation-fill-mode', 'animation-frame-time', 'animation-iteration-count', 'animation-name', 'animation-timing-function', 'transition', 'transition-delay', 'transition-duration', 'transition-frame-time', 'transition-high-framerate', 'transition-property', 'transition-timing-function']],
  ['Masks, Tooltips & Menus', ['context-menu-arrow-position', 'context-menu-body-position', 'context-menu-position', 'opacity-mask', 'opacity-mask-position', 'opacity-mask-scale', 'opacity-mask-threshold', 'tooltip-arrow-position', 'tooltip-body-position', 'tooltip-position']],
  ['Interaction & Other', ['cursor', 'opacity', 'opacity-brush', 'overflow', 'sound', 'sound-out', 'texture-sampling', 'visibility']],
];
const groupedProperties = new Set(groupDefinitions.flatMap(([, properties]) => properties));
export const styleGroups = [
  ...groupDefinitions.map(([label, properties]) => ({label, options: properties.filter(property => styleOptions.includes(property))})),
  {label: 'Other cached properties', options: styleOptions.filter(property => !groupedProperties.has(property))},
].filter(group => group.options.length);

function rule(kind: ValueKind, initial: string, hint: string, choices?: readonly string[]): ValueRule {
  return {kind, initial, hint, choices};
}

const rules: Partial<Record<string, ValueRule>> = {};
function assign(properties: string[], value: ValueRule) {
  for (const property of properties) rules[property] = value;
}

const blendModes = ['additive', 'colorburn', 'colordodge', 'darken', 'hardlight', 'hue', 'lighten', 'linearburn', 'multiply', 'normal', 'opaque', 'overlay', 'screen'];
const flowChildren = ['none', 'left', 'right', 'up', 'down', 'right-wrap', 'down-wrap'];
const horizontalAlign = ['left', 'center', 'right'];
const verticalAlign = ['top', 'center', 'bottom'];
const borderStyles = ['solid', 'dashed', 'none'];
const borderImageRepeats = ['stretch', 'repeat', 'round', 'space'];

assign(['width', 'height'], rule('length', '240px', 'Length: px, %, fit-children, fill-parent-flow'));
assign(['min-width', 'min-height'], rule('length', '0px', 'Length: px, %, or none'));
assign(['max-width', 'max-height'], rule('length', 'none', 'Length: px, %, or none'));
assign(['x', 'y'], rule('length', '0px', 'Single position offset; bare numbers become px'));
assign(['z'], rule('length', '0px', 'Depth position; bare numbers become px'));
assign(['position'], rule('position', '0px 0px 0px', 'Three values: X Y Z; bare numbers become px'));
assign(['align'], rule('position-expression', 'center center', 'Horizontal and vertical alignment keywords, for example center center'));
assign(['horizontal-align'], rule('enum', 'center', 'Horizontal parent alignment', horizontalAlign));
assign(['vertical-align'], rule('enum', 'center', 'Vertical parent alignment', verticalAlign));
assign(['flow-children'], rule('enum', 'right', 'Child flow direction', flowChildren));
assign(['ignore-parent-flow'], rule('boolean', 'false', 'Boolean: true or false', ['true', 'false']));
assign(['layout-position'], rule('enum', 'static', 'Panel positioning mode', ['static', 'fixed']));
assign(['z-index'], rule('number', '0', 'Unitless paint and hit-test order'));

assign(['margin', 'padding'], rule('length-list', '0px', 'One to four px or % lengths'));
assign(['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'], rule('length', '0px', 'Single px or % length'));

assign(['background-color', 'color', 'wash-color'], rule('color', '#ffffffff', 'Panorama color, rgba(), or gradient()'));
assign(['background-color-opacity', 'background-img-opacity', 'opacity'], rule('number', '1.0', 'Unitless number from 0.0 to 1.0'));
assign(['background-image', 'border-image-source', 'opacity-mask'], rule('resource', 'url("file://{images}/example.tga")', 'Source 2 resource path or url(...) expression'));
assign(['background-position'], rule('position-expression', '0% 0%', 'Position keywords and/or two px or % offsets'));
assign(['background-repeat'], rule('enum-list', 'repeat', 'One or two values: repeat, space, round, no-repeat, repeat-x, or repeat-y'));
assign(['background-size'], rule('length-list', 'auto', 'One or two px, %, auto, or contains values'));
assign(['background-texture-size'], rule('length-pair', '0px 0px', 'Texture width and height in px or %'));
assign(['background-blur', 'blur', 'world-blur'], rule('blur', 'gaussian( 2.5 )', 'gaussian(...) or mipmapgaussian(...) expression'));

assign(['border', 'border-top', 'border-right', 'border-bottom', 'border-left'], rule('border', '1px solid #ffffffff', 'Width, style, and color: px + solid/dashed/none + color'));
assign(['border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'], rule('color-list', '#ffffffff', 'One to four Panorama colors'));
assign(['border-style', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'], rule('enum-list', 'solid', 'solid, dashed, or none; side shorthands accept 1–4 values', borderStyles));
assign(['border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'], rule('length-list', '0px', 'One to four px or % border widths'));
assign(['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], rule('length-list', '0px', 'One to four px or % radii; use / for elliptical vertical radii'));
assign(['border-brush'], rule('color', 'gradient( linear, 0% 0%, 0% 100%, from( #ffffffff ), to( #00000000 ) )', 'Color or gradient(...) brush'));
assign(['border-image'], rule('raw', 'url("file://message_border.png") 25% repeat', 'Resource, slice, width/outset, and repeat shorthand'));
assign(['border-image-outset'], rule('length-list', '0px', 'One to four px, %, or unitless outset values'));
assign(['border-image-repeat'], rule('enum-list', 'stretch', 'One or two values: stretch, repeat, round, or space', borderImageRepeats));
assign(['border-image-slice'], rule('length-list', '100%', 'One to four px, %, or auto slice values'));
assign(['border-image-width'], rule('raw', '1', 'One to four px, %, auto, or unitless border-width multipliers'));
assign(['box-shadow'], rule('shadow', '#ffffff80 0px 0px 8px 0px', 'Optional inset/fill/hollow, color, four px lengths'));

assign(['font'], rule('raw', 'normal 18px Arial', 'Font shorthand; keep the Panorama font family and size tokens'));
assign(['font-family'], rule('text', 'Arial', 'Font face name'));
assign(['font-size'], rule('length', '18px', 'Font size in px or %; bare numbers become px'));
assign(['font-stretch'], rule('enum', 'normal', 'Font stretch', ['normal', 'condensed', 'expanded']));
assign(['font-style'], rule('enum', 'normal', 'Font style', ['normal', 'italic']));
assign(['font-weight'], rule('enum', 'normal', 'Font weight', ['thin', 'light', 'normal', 'medium', 'bold', 'black']));
assign(['letter-spacing'], rule('length', '0px', 'Letter spacing in px or %'));
assign(['line-height'], rule('line-height', 'normal', 'normal, unitless multiplier, px, or %'));
assign(['paragraph-spacing'], rule('length', '0px', 'Paragraph spacing in px or %'));
assign(['text-align'], rule('enum', 'left', 'Text alignment', ['left', 'right', 'center', 'justify', 'justify-letter-spacing']));
assign(['text-decoration'], rule('enum', 'none', 'Text decoration', ['none', 'underline', 'line-through']));
assign(['text-decoration-style'], rule('enum', 'none', 'Decoration style', ['none', 'dashed', 'dotted', 'wavy']));
assign(['text-overflow'], rule('raw', 'ellipsis', 'clip, ellipsis, noclip, shrink, or shrink min( px ) [ellipsis]'));
assign(['text-shadow'], rule('shadow', '#ffffff80 0px 0px 8px 1.0', 'Color, three px lengths, and optional unitless strength'));
assign(['text-transform'], rule('enum', 'none', 'Text transform', ['none', 'uppercase', 'lowercase']));
assign(['white-space'], rule('enum', 'normal', 'Whitespace wrapping', ['normal', 'nowrap']));

assign(['-s2-mix-blend-mode'], rule('enum', 'normal', 'Source 2 blend mode', blendModes));
assign(['brightness', 'contrast', 'saturation'], rule('number', '1.0', 'Unitless composition multiplier'));
assign(['hue-rotation', 'pre-transform-rotate2d'], rule('angle', '0deg', 'Angle in deg; bare numbers become deg'));
assign(['clip'], rule('raw', 'rect( 0% 100% 100% 0% )', 'rect(...) or radial(...) clip expression'));
assign(['img-shadow'], rule('shadow', '0px 0px 8px 1.0 #333333b0 alpha-only', 'Three px lengths, unitless strength, color, optional sampling mode'));
assign(['perspective'], rule('number', '1000', 'Unitless perspective depth'));
assign(['perspective-origin'], rule('percentage-pair', '50% 50%', 'X and Y origin percentages'));
assign(['pre-transform-scale2d'], rule('scale', '1.0', 'One or two unitless X/Y scale factors'));
assign(['transform'], rule('transform', 'translate3d( 0px, 0px, 0px )', 'Transform functions such as translate3d, scale3d, rotatex/y/z'));
assign(['transform-origin'], rule('percentage-pair', '50% 50%', 'X and Y origin percentages'));
assign(['ui-scale'], rule('scale-percent', '100%', 'One to three percentage scale factors'));
assign(['ui-scale-x', 'ui-scale-y', 'ui-scale-z'], rule('scale-percent', '100%', 'Percentage scale factor'));
assign(['opacity-brush'], rule('color', 'gradient( linear, 0% 0%, 0% 100%, from( #ffffffff ), to( #ffffff00 ) )', 'gradient(...) opacity brush'));
assign(['opacity-mask-position'], rule('percentage-pair', '50% 50%', 'X and Y mask position percentages'));
assign(['opacity-mask-scale'], rule('scale-percent', '100%', 'One or two percentage scale factors'));
assign(['opacity-mask-threshold'], rule('number', '0.0', 'Unitless threshold from 0.0 to 1.0'));

assign(['animation'], rule('raw', 'none', 'Animation shorthand; preserve name, duration, delay, and timing tokens'));
assign(['animation-delay', 'animation-duration', 'animation-frame-time', 'transition-delay', 'transition-duration', 'transition-frame-time'], rule('duration-list', '0s', 'One or more durations in s or ms'));
assign(['animation-direction'], rule('enum', 'normal', 'Animation direction', ['normal', 'reverse', 'alternate', 'alternate-reverse']));
assign(['animation-fill-mode'], rule('enum', 'none', 'Animation fill mode', ['none', 'forwards', 'backwards', 'both']));
assign(['animation-iteration-count'], rule('raw', '1', 'Unitless count or infinite'));
assign(['animation-name'], rule('text', 'none', 'Animation name'));
assign(['animation-timing-function', 'transition-timing-function'], rule('timing-list', 'ease', 'ease, ease-in, ease-out, ease-in-out, linear, or cubic-bezier(...)'));
assign(['transition'], rule('raw', 'all 0.2s ease', 'Property, duration, timing function, and delay shorthand'));
assign(['transition-high-framerate'], rule('boolean-list', 'true', 'true or false; comma-separated values are allowed'));
assign(['transition-property'], rule('text', 'all', 'One or more Panorama property names'));

assign(['context-menu-arrow-position', 'context-menu-body-position', 'tooltip-arrow-position', 'tooltip-body-position'], rule('percentage-pair', '50% 50%', 'X and Y percentages'));
assign(['context-menu-position', 'tooltip-position'], rule('enum-list', 'right left bottom top', 'One to four side keywords: left, top, right, bottom'));
assign(['cursor'], rule('text', 'default', 'Panorama cursor keyword'));
assign(['overflow'], rule('enum-list', 'squish squish', 'Horizontal and vertical values: squish, clip, scroll, or noclip'));
assign(['sound', 'sound-out'], rule('text', '""', 'Sound name or sound resource token'));
assign(['texture-sampling'], rule('enum', 'normal', 'Texture sampling mode', ['normal', 'alpha-only', 'legacy', 'point']));
assign(['visibility'], rule('enum', 'visible', 'Panel visibility', ['visible', 'collapse']));

function descriptionHint(property: string) {
  const description = cachedProperties[property]?.description?.replace(/\s+/g, ' ').trim();
  if (!description) return 'Raw Panorama value; preserve the property-specific structure.';
  return description.length > 180 ? `${description.slice(0, 177)}…` : description;
}

/** Every property in the cache has an Inspector rule, even if a future cache entry is raw-only. */
export const valueRules: Record<string, ValueRule> = Object.fromEntries(styleOptions.map(property => [
  property,
  rules[property] || rule('raw', '', descriptionHint(property)),
])) as Record<string, ValueRule>;

const lengthKeywords = new Set(['fit-children', 'fill-parent-flow', 'auto', 'none', 'contains']);
const numericPattern = /^-?(?:\d+\.?\d*|\.\d+)$/;
const unitPattern = /^-?(?:\d+\.?\d*|\.\d+)(?:px|%|em|rem|vh|vw|vmin|vmax)$/i;
const percentageKeywords = new Set(['left', 'center', 'right', 'top', 'bottom']);

function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function numericValue(value: string) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : undefined;
}

function lengthToken(token: string, defaultUnit = 'px') {
  const value = token.trim();
  if (!value) return `0${defaultUnit}`;
  if (lengthKeywords.has(value.toLowerCase()) || unitPattern.test(value)) return value;
  if (numericPattern.test(value)) return `${value}${defaultUnit}`;
  return value;
}

function normalizeLengthSequence(value: string, max = 4, defaultUnit = 'px') {
  if (!value.trim()) return `0${defaultUnit}`;
  if (/[()"]/.test(value)) return value.trim();
  const slashParts = value.trim().split('/').map(part => part.trim()).filter(Boolean);
  return slashParts.map(part => part.split(/[\s,]+/).filter(Boolean).slice(0, max).map(token => lengthToken(token, defaultUnit)).join(' ')).join(' / ');
}

function normalizePosition(value: string, count = 3) {
  const parts = value.trim().split(/[\s,]+/).filter(Boolean).slice(0, count).map(token => lengthToken(token));
  while (parts.length < count) parts.push('0px');
  return parts.join(' ');
}

function normalizePercentageToken(token: string) {
  const value = token.trim();
  if (!value) return '0%';
  if (percentageKeywords.has(value.toLowerCase()) || /%$/.test(value) || unitPattern.test(value)) return value;
  if (numericPattern.test(value)) return `${value}%`;
  return value;
}

function normalizePercentagePair(value: string, count = 2) {
  if (/[()"]/.test(value)) return value.trim();
  const parts = value.trim().split(/[\s,]+/).filter(Boolean).slice(0, count).map(normalizePercentageToken);
  while (parts.length < count) parts.push('50%');
  return parts.join(' ');
}

function normalizePositionExpression(value: string) {
  if (!value.trim()) return '0% 0%';
  if (/[()"]/.test(value)) return value.trim();
  return value.trim().split(/[\s,]+/).filter(Boolean).map(token => normalizePercentageToken(token)).join(' ');
}

function normalizeHexColor(match: string) {
  const hex = match.slice(1);
  if (hex.length === 3) return `#${hex.split('').map(value => value + value).join('')}ff`;
  if (hex.length === 4) return `#${hex.split('').map(value => value + value).join('')}`;
  if (hex.length === 6) return `${match}ff`;
  return match;
}

function normalizeColor(value: string) {
  return value.trim().replace(/#[\da-f]{3,8}\b/gi, normalizeHexColor);
}

function normalizeOpacity(value: string) {
  const parsed = numericValue(value);
  if (parsed === undefined) return '0.0';
  const normalized = /%$/.test(value.trim()) ? parsed / 100 : parsed;
  return Math.min(1, Math.max(0, normalized)).toFixed(2).replace(/0$/, '');
}

function normalizeNumber(value: string, fallback = '0') {
  const parsed = numericValue(value);
  return parsed === undefined ? fallback : trimNumber(parsed);
}

function normalizeAngle(value: string) {
  const raw = value.trim();
  if (!raw) return '0deg';
  if (numericPattern.test(raw)) return `${raw}deg`;
  return raw;
}

function normalizeDurationToken(token: string) {
  const raw = token.trim();
  if (numericPattern.test(raw)) return `${raw}s`;
  return raw;
}

function normalizeDurations(value: string) {
  return value.trim().split(',').filter(Boolean).map(part => part.trim().split(/\s+/).map(normalizeDurationToken).join(' ')).join(', ');
}

function normalizeScale(value: string, percent = false) {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean).slice(0, 3);
  const normalized = tokens.map(token => {
    if (percent) return /%$/.test(token) ? token : numericPattern.test(token) ? `${token}%` : token;
    return normalizeNumber(token, '0');
  });
  return normalized.join(', ') || (percent ? '100%' : '1.0');
}

function normalizeBoolean(value: string, fallback = 'false') {
  const raw = value.trim().toLowerCase();
  return raw === 'true' || raw === 'false' ? raw : fallback;
}

function normalizeBooleanList(value: string) {
  return value.trim().split(/[\s,]+/).filter(Boolean).map(token => normalizeBoolean(token)).join(', ') || 'false';
}

function normalizeEnum(value: string, choices: readonly string[], fallback: string) {
  const found = choices.find(choice => choice.toLowerCase() === value.trim().toLowerCase());
  return found || fallback;
}

function normalizeEnumList(value: string, choices?: readonly string[], fallback = '') {
  if (!choices) return value.trim() || fallback;
  const normalized = value.trim().split(/[\s,]+/).filter(Boolean).map(token => normalizeEnum(token, choices, '')).filter(Boolean);
  return normalized.join(' ') || fallback;
}

function normalizeBorder(value: string) {
  const raw = value.trim();
  if (!raw) return '1px solid #ffffffff';
  const normalized = raw.replace(/(^|\s)(-?(?:\d+\.?\d*|\.\d+))(?![\w.%])/g, '$1$2px');
  return normalizeColor(normalized);
}

function normalizeShadow(value: string, property: string) {
  const raw = normalizeColor(value.trim());
  if (!raw) return value;
  const lengthCount = property === 'box-shadow' ? 4 : 3;
  let seen = 0;
  return raw.replace(/(^|[\s,])(-?(?:\d+\.?\d*|\.\d+))(?![\w.%])/g, (match, prefix: string, token: string) => {
    if (seen >= lengthCount) return match;
    seen += 1;
    return `${prefix}${token}px`;
  });
}

function normalizeTransform(value: string) {
  let output = value.trim();
  output = output.replace(/\b(translate3d|translatex|translatey|translatez)\(([^)]*)\)/gi, (_match, operation: string, args: string) => {
    const count = operation.toLowerCase() === 'translate3d' ? 3 : 1;
    return `${operation}(${normalizeLengthSequence(args, count)})`;
  });
  output = output.replace(/\b(rotate3d|rotatex|rotatey|rotatez|skew|skewx|skewy)\(([^)]*)\)/gi, (_match, operation: string, args: string) => {
    return `${operation}(${args.trim().split(/[\s,]+/).filter(Boolean).map(normalizeAngle).join(', ')})`;
  });
  return output;
}

function normalizeLineHeight(value: string) {
  const raw = value.trim();
  if (!raw) return 'normal';
  return raw;
}

export function normalizeVcssValue(property: string, input: string): string {
  const key = property.trim().toLowerCase();
  const currentRule = valueRules[key] || rule('raw', '', 'Raw Panorama value; preserve the property-specific structure.');
  const raw = input.trim();
  if (!raw && currentRule.initial) return currentRule.initial;
  switch (currentRule.kind) {
    case 'length': return lengthToken(raw);
    case 'length-list': return normalizeLengthSequence(raw);
    case 'length-pair': return normalizeLengthSequence(raw, 2);
    case 'position': return normalizePosition(raw);
    case 'position-expression': return normalizePositionExpression(raw);
    case 'percentage-pair': return normalizePercentagePair(raw);
    case 'color':
    case 'color-list': return normalizeColor(raw);
    case 'number': return key === 'opacity' || key.endsWith('-opacity') ? normalizeOpacity(raw) : normalizeNumber(raw, currentRule.initial);
    case 'angle': return normalizeAngle(raw);
    case 'duration': return normalizeDurationToken(raw);
    case 'duration-list': return normalizeDurations(raw);
    case 'scale': return normalizeScale(raw);
    case 'scale-percent': return normalizeScale(raw, true);
    case 'boolean': return normalizeBoolean(raw, currentRule.initial);
    case 'boolean-list': return normalizeBooleanList(raw);
    case 'enum': return currentRule.choices ? normalizeEnum(raw, currentRule.choices, currentRule.initial) : raw || currentRule.initial;
    case 'enum-list': return normalizeEnumList(raw, currentRule.choices, currentRule.initial);
    case 'border': return normalizeBorder(raw);
    case 'shadow': return normalizeShadow(raw, key);
    case 'blur': return /^\w+gaussian\s*\(/i.test(raw) ? raw : numericPattern.test(raw) ? `gaussian( ${raw} )` : raw || currentRule.initial;
    case 'transform': return normalizeTransform(raw);
    case 'line-height': return normalizeLineHeight(raw);
    case 'timing-list': return raw || currentRule.initial;
    case 'raw':
    case 'resource':
    case 'text':
    default: return raw || currentRule.initial;
  }
}

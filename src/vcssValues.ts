export type ValueRule = {initial:string;hint:string;choices?:string[]};

export const styleOptions = ['width','height','min-width','min-height','position','margin','padding','flow-children','horizontal-align','vertical-align','background-color','border','border-radius','color','font-size','font-weight','opacity','wash-color','transform','pre-transform-scale2d','visibility'];

export const valueRules:Record<string,ValueRule>={
  'width':{initial:'240px',hint:'Length: px, %, fit-children, fill-parent-flow'},'height':{initial:'80px',hint:'Length: px, %, fit-children, fill-parent-flow'},
  'min-width':{initial:'0px',hint:'Length: px or %'},'min-height':{initial:'0px',hint:'Length: px or %'},
  'position':{initial:'0px 0px 0px',hint:'X Y Z; unitless numbers become px'},'margin':{initial:'0px',hint:'1–4 px or % lengths'},'padding':{initial:'8px',hint:'1–4 px or % lengths'},
  'flow-children':{initial:'right',hint:'Child flow direction',choices:['none','left','right','up','down','right-wrap','down-wrap']},
  'horizontal-align':{initial:'center',hint:'Horizontal parent alignment',choices:['left','center','right']},'vertical-align':{initial:'center',hint:'Vertical parent alignment',choices:['top','center','bottom']},
  'background-color':{initial:'#000000ff',hint:'Panorama color, rgba(), or gradient()'},'color':{initial:'#ffffffff',hint:'Panorama color'},'wash-color':{initial:'#ffffffff',hint:'Panorama tint color'},
  'border':{initial:'1px solid #ffffffff',hint:'Width style color'},'border-radius':{initial:'4px',hint:'1–4 px or % radii'},'font-size':{initial:'18px',hint:'Font size in px or %'},
  'font-weight':{initial:'normal',hint:'Font weight',choices:['thin','light','normal','medium','bold','black']},
  'opacity':{initial:'1.0',hint:'Unitless number from 0.0 to 1.0'},'pre-transform-scale2d':{initial:'1.0',hint:'One or two unitless scale factors'},
  'visibility':{initial:'visible',hint:'Panel visibility',choices:['visible','collapse']},'transform':{initial:'translate3d( 0px, 0px, 0px )',hint:'translate/rotate lengths use px, %, or deg as appropriate'}
};

const lengthKeywords=new Set(['fit-children','fill-parent-flow','auto','none']);
function lengthToken(token:string,defaultUnit='px'){const value=token.trim();if(!value)return `0${defaultUnit}`;if(lengthKeywords.has(value)||/^-?[\d.]+(?:px|%)$/i.test(value))return value;if(/^-?[\d.]+$/.test(value))return `${value}${defaultUnit}`;return value;}
function lengths(value:string,count?:number){const parts=value.trim().split(/[\s,]+/).filter(Boolean).map(token=>lengthToken(token));while(count&&parts.length<count)parts.push('0px');return (count?parts.slice(0,count):parts.slice(0,4)).join(' ');}
function color(value:string){const raw=value.trim();if(/^(rgba?\(|gradient\(|#)/i.test(raw)){if(/^#[\da-f]{3}$/i.test(raw))return `#${raw.slice(1).split('').map(x=>x+x).join('')}ff`;if(/^#[\da-f]{6}$/i.test(raw))return `${raw}ff`;return raw}if(/^[\da-f]{6}$/i.test(raw))return `#${raw}ff`;if(/^[\da-f]{8}$/i.test(raw))return `#${raw}`;return raw;}

export function normalizeVcssValue(property:string,input:string):string{const raw=input.trim();if(['width','height','min-width','min-height','font-size','border-radius'].includes(property))return lengths(raw);if(['margin','padding'].includes(property))return lengths(raw);if(property==='position')return lengths(raw,3);if(['background-color','color','wash-color'].includes(property))return color(raw);if(property==='opacity')return Math.min(1,Math.max(0,Number.parseFloat(raw)||0)).toFixed(2).replace(/0$/,'');if(property==='pre-transform-scale2d')return raw.split(/[\s,]+/).filter(Boolean).slice(0,2).map(item=>String(Number.parseFloat(item)||0)).join(', ');if(valueRules[property]?.choices)return valueRules[property].choices!.includes(raw)?raw:valueRules[property].initial;if(property==='border'&&/^-?[\d.]+$/.test(raw))return `${raw}px solid #ffffffff`;return raw||valueRules[property]?.initial||'';}

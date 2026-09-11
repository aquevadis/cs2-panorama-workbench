export type HudPresetLayout = 'row' | 'column' | 'bar' | 'banner';
export type HudPresetDesign = 'standard' | 'chevrons' | 'reticle' | 'ring' | 'notched-frame' | 'diagnostic' | 'equalizer';

export type HudPreset = {
  key: string;
  name: string;
  category: string;
  glyph: string;
  primaryText: string;
  secondaryText: string;
  accent: string;
  width: number;
  height: number;
  layout: HudPresetLayout;
  design?: HudPresetDesign;
  collection?: 'Core' | 'Reference matched';
};

export const coreHudPresets: HudPreset[] = [
  {key:'health-bar',name:'Health Bar',category:'Player',glyph:'✚',primaryText:'100',secondaryText:'HEALTH',accent:'#55e58aff',width:260,height:72,layout:'bar'},
  {key:'armor-meter',name:'Armor Meter',category:'Player',glyph:'◆',primaryText:'85',secondaryText:'ARMOR',accent:'#55b8ffff',width:230,height:66,layout:'bar'},
  {key:'ammo-counter',name:'Ammo Counter',category:'Combat',glyph:'◈',primaryText:'30 / 90',secondaryText:'AMMO',accent:'#ffd166ff',width:220,height:68,layout:'row'},
  {key:'round-timer',name:'Round Timer',category:'Match',glyph:'◷',primaryText:'01:42',secondaryText:'ROUND 8',accent:'#f7f7f7ff',width:210,height:74,layout:'column'},
  {key:'score-strip',name:'Score Strip',category:'Match',glyph:'VS',primaryText:'7  —  5',secondaryText:'ROUND SCORE',accent:'#74d7ffff',width:320,height:70,layout:'banner'},
  {key:'money-badge',name:'Money Badge',category:'Player',glyph:'$',primaryText:'$ 4,750',secondaryText:'BALANCE',accent:'#8de969ff',width:210,height:62,layout:'row'},
  {key:'kill-feed-row',name:'Kill Feed Row',category:'Combat',glyph:'✦',primaryText:'PLAYER  →  ENEMY',secondaryText:'HEADSHOT',accent:'#ff6b6bff',width:360,height:58,layout:'row'},
  {key:'objective-alert',name:'Objective Alert',category:'Alerts',glyph:'!',primaryText:'BOMB PLANTED',secondaryText:'DEFUSE THE TARGET',accent:'#ff9f43ff',width:380,height:82,layout:'banner'},
  {key:'wave-counter',name:'Wave Counter',category:'Zombies',glyph:'W',primaryText:'WAVE 12',secondaryText:'INCOMING',accent:'#b678ffff',width:250,height:72,layout:'column'},
  {key:'zombie-count',name:'Zombie Count',category:'Zombies',glyph:'☣',primaryText:'24',secondaryText:'ZOMBIES LEFT',accent:'#9bea56ff',width:240,height:70,layout:'row'},
  {key:'infection-warning',name:'Infection Warning',category:'Zombies',glyph:'☢',primaryText:'INFECTION',secondaryText:'SEEK COVER',accent:'#d6ff45ff',width:350,height:82,layout:'banner'},
  {key:'boss-health',name:'Boss Health',category:'Zombies',glyph:'B',primaryText:'THE OVERLORD',secondaryText:'72% HEALTH',accent:'#ff4d7dff',width:520,height:78,layout:'bar'},
  {key:'combo-meter',name:'Combo Meter',category:'Combat',glyph:'×',primaryText:'12 COMBO',secondaryText:'+ 850 SCORE',accent:'#ff75d8ff',width:245,height:72,layout:'column'},
  {key:'xp-progress',name:'XP Progress',category:'Progress',glyph:'XP',primaryText:'LEVEL 38',secondaryText:'7,450 / 10,000',accent:'#7d8cffff',width:340,height:70,layout:'bar'},
  {key:'mission-tracker',name:'Mission Tracker',category:'Progress',glyph:'✓',primaryText:'SURVIVE 3 WAVES',secondaryText:'2 / 3 COMPLETE',accent:'#55e6c1ff',width:380,height:78,layout:'bar'},
  {key:'player-status',name:'Player Status Card',category:'Player',glyph:'P',primaryText:'PLAYER NAME',secondaryText:'ALIVE · 100 HP',accent:'#67e8f9ff',width:310,height:78,layout:'row'},
  {key:'teammate-card',name:'Teammate Card',category:'Team',glyph:'T',primaryText:'TEAMMATE',secondaryText:'82 HP · M4A1-S',accent:'#4dabf7ff',width:300,height:72,layout:'row'},
  {key:'spectator-badge',name:'Spectator Badge',category:'Team',glyph:'◉',primaryText:'SPECTATING',secondaryText:'PLAYER NAME',accent:'#b2bec3ff',width:265,height:62,layout:'column'},
  {key:'location-chip',name:'Location Chip',category:'Navigation',glyph:'⌖',primaryText:'B BOMB SITE',secondaryText:'LOCATION',accent:'#ffeaa7ff',width:230,height:60,layout:'row'},
  {key:'weapon-panel',name:'Weapon Panel',category:'Combat',glyph:'W',primaryText:'AK-47',secondaryText:'PRIMARY WEAPON',accent:'#fab1a0ff',width:280,height:76,layout:'row'},
  {key:'grenade-slot',name:'Grenade Slot',category:'Combat',glyph:'G',primaryText:'2',secondaryText:'GRENADES',accent:'#81ececff',width:180,height:62,layout:'row'},
  {key:'ability-cooldown',name:'Ability Cooldown',category:'Combat',glyph:'A',primaryText:'READY',secondaryText:'SPECIAL ABILITY',accent:'#a29bfeff',width:250,height:68,layout:'bar'},
  {key:'notification-toast',name:'Notification Toast',category:'Alerts',glyph:'i',primaryText:'OBJECTIVE UPDATED',secondaryText:'New route unlocked',accent:'#74b9ffff',width:390,height:76,layout:'row'},
  {key:'center-banner',name:'Center Banner',category:'Alerts',glyph:'◆',primaryText:'ROUND START',secondaryText:'PREPARE TO ENGAGE',accent:'#ffffffff',width:480,height:92,layout:'banner'},
  {key:'damage-indicator',name:'Damage Indicator',category:'Combat',glyph:'−',primaryText:'-34',secondaryText:'DAMAGE TAKEN',accent:'#ff5252ff',width:210,height:64,layout:'row'},
  {key:'interaction-prompt',name:'Interaction Prompt',category:'Prompts',glyph:'E',primaryText:'HOLD TO INTERACT',secondaryText:'OPEN SUPPLY CRATE',accent:'#feca57ff',width:360,height:70,layout:'row'},
  {key:'server-info',name:'Server Info Chip',category:'System',glyph:'S',primaryText:'BGKOKA ZM',secondaryText:'128 TICK · 24 PLAYERS',accent:'#48dbfbff',width:315,height:64,layout:'column'},
  {key:'performance-meter',name:'Ping / FPS Meter',category:'System',glyph:'↯',primaryText:'144 FPS',secondaryText:'28 MS',accent:'#1dd1a1ff',width:220,height:58,layout:'row'},
  {key:'voice-chat-row',name:'Voice Chat Row',category:'Team',glyph:'◖',primaryText:'PLAYER SPEAKING',secondaryText:'VOICE CHAT',accent:'#54a0ffff',width:300,height:62,layout:'row'},
  {key:'round-result',name:'Round Result Banner',category:'Match',glyph:'★',primaryText:'ROUND WON',secondaryText:'COUNTER-TERRORISTS',accent:'#5fafffff',width:500,height:96,layout:'banner'},
];

export const referenceHudPresets: HudPreset[] = [
  {key:'ref-triple-chevron',name:'Triple Chevron Status',category:'Violet Interface',glyph:'›››',primaryText:'SYSTEM READY',secondaryText:'03 ACTIVE CHANNELS',accent:'#7948ffff',width:360,height:112,layout:'bar',design:'chevrons',collection:'Reference matched'},
  {key:'ref-long-chevron',name:'Long Chevron Meter',category:'Violet Interface',glyph:'◇',primaryText:'87%',secondaryText:'CORE CAPACITY',accent:'#7443ffff',width:390,height:72,layout:'bar',design:'chevrons',collection:'Reference matched'},
  {key:'ref-orbit-target',name:'Orbit Target',category:'Violet Reticles',glyph:'×',primaryText:'LOCK',secondaryText:'TARGET ACQUIRED',accent:'#7744ffff',width:126,height:126,layout:'column',design:'ring',collection:'Reference matched'},
  {key:'ref-hex-core',name:'Hex Core Emblem',category:'Violet Reticles',glyph:'◆',primaryText:'CORE',secondaryText:'ONLINE',accent:'#8150ffff',width:146,height:118,layout:'column',design:'reticle',collection:'Reference matched'},
  {key:'ref-split-lens',name:'Split Lens Reticle',category:'Violet Reticles',glyph:'✦',primaryText:'FOCUS',secondaryText:'2.4×',accent:'#6f40ffff',width:132,height:132,layout:'column',design:'reticle',collection:'Reference matched'},
  {key:'ref-dot-matrix',name:'Dot Matrix Console',category:'Violet Interface',glyph:'•••',primaryText:'SCANNING',secondaryText:'SIGNAL 94%',accent:'#7546ffff',width:330,height:86,layout:'bar',design:'diagnostic',collection:'Reference matched'},
  {key:'ref-twin-rail',name:'Twin Rail Gauge',category:'Violet Interface',glyph:'≡',primaryText:'POWER BUS',secondaryText:'DUAL FEED',accent:'#7344ffff',width:310,height:84,layout:'bar',design:'chevrons',collection:'Reference matched'},
  {key:'ref-compass',name:'Compass Reticle',category:'Violet Reticles',glyph:'✣',primaryText:'N 025',secondaryText:'BEARING',accent:'#8658ffff',width:140,height:140,layout:'column',design:'reticle',collection:'Reference matched'},
  {key:'ref-square-crosshair',name:'Square Crosshair',category:'Violet Reticles',glyph:'□',primaryText:'TRACK',secondaryText:'STABLE',accent:'#7948ffff',width:130,height:130,layout:'column',design:'reticle',collection:'Reference matched'},
  {key:'ref-ring-lock',name:'Ring Lock',category:'Violet Reticles',glyph:'⊕',primaryText:'LOCKED',secondaryText:'100%',accent:'#8354ffff',width:144,height:144,layout:'column',design:'ring',collection:'Reference matched'},
  {key:'ref-notched-card',name:'Notched Data Card',category:'Violet Cards',glyph:'◇',primaryText:'DATA NODE 07',secondaryText:'ENCRYPTED LINK',accent:'#7948ffff',width:300,height:112,layout:'row',design:'notched-frame',collection:'Reference matched'},
  {key:'ref-slanted-readout',name:'Slanted Readout',category:'Violet Cards',glyph:'/',primaryText:'VELOCITY 640',secondaryText:'VECTOR NOMINAL',accent:'#7140ffff',width:320,height:86,layout:'row',design:'notched-frame',collection:'Reference matched'},
  {key:'ref-layered-shield',name:'Layered Shield Plate',category:'Violet Cards',glyph:'⬡',primaryText:'SHIELD 76',secondaryText:'LAYER 03',accent:'#8052ffff',width:300,height:116,layout:'column',design:'notched-frame',collection:'Reference matched'},
  {key:'ref-compact-terminal',name:'Compact Terminal',category:'Violet Cards',glyph:'▣',primaryText:'TERMINAL',secondaryText:'ACCESS GRANTED',accent:'#7546ffff',width:280,height:84,layout:'column',design:'diagnostic',collection:'Reference matched'},
  {key:'ref-stacked-message',name:'Stacked Message',category:'Violet Cards',glyph:'▤',primaryText:'NEW MESSAGE',secondaryText:'3 SECURE PACKETS',accent:'#8150ffff',width:300,height:96,layout:'column',design:'diagnostic',collection:'Reference matched'},
  {key:'ref-angled-mission',name:'Angled Mission Tile',category:'Violet Cards',glyph:'▶',primaryText:'OBJECTIVE',secondaryText:'REACH EXTRACTION',accent:'#7645ffff',width:330,height:94,layout:'row',design:'notched-frame',collection:'Reference matched'},
  {key:'ref-cross-blade',name:'Cross Blade Marker',category:'Violet Reticles',glyph:'×',primaryText:'HOSTILE',secondaryText:'MARKED',accent:'#7c49ffff',width:132,height:132,layout:'column',design:'reticle',collection:'Reference matched'},
  {key:'ref-segmented-arc',name:'Segmented Arc Meter',category:'Violet Reticles',glyph:'◒',primaryText:'68%',secondaryText:'CHARGE',accent:'#8454ffff',width:148,height:132,layout:'column',design:'ring',collection:'Reference matched'},
  {key:'ref-waveform',name:'Waveform Scope',category:'Violet Signals',glyph:'⌁',primaryText:'WAVE 12',secondaryText:'FREQUENCY LOCK',accent:'#814fffff',width:320,height:82,layout:'row',design:'equalizer',collection:'Reference matched'},
  {key:'ref-spectrum',name:'Spectrum Equalizer',category:'Violet Signals',glyph:'▥',primaryText:'SPECTRUM',secondaryText:'LIVE INPUT',accent:'#7343ffff',width:350,height:92,layout:'row',design:'equalizer',collection:'Reference matched'},
  {key:'ref-neon-corner',name:'Neon Corner Frame',category:'Cyberpunk Frames',glyph:'⌜',primaryText:'PLAYER FEED',secondaryText:'VISUAL CHANNEL',accent:'#ff35efff',width:390,height:190,layout:'column',design:'notched-frame',collection:'Reference matched'},
  {key:'ref-scan-window',name:'Cyber Scan Window',category:'Cyberpunk Frames',glyph:'⌁',primaryText:'SCAN WINDOW',secondaryText:'ANALYZING SECTOR',accent:'#f62fe8ff',width:430,height:210,layout:'column',design:'diagnostic',collection:'Reference matched'},
  {key:'ref-grid-radar',name:'Grid Radar Panel',category:'Cyberpunk Frames',glyph:'⌗',primaryText:'RADAR GRID',secondaryText:'12 CONTACTS',accent:'#ff43efff',width:260,height:260,layout:'column',design:'reticle',collection:'Reference matched'},
  {key:'ref-connection-alert',name:'Connection Alert',category:'Sci-Fi Diagnostics',glyph:'!',primaryText:'CONNECTION 239.75',secondaryText:'PACKET LOSS DETECTED',accent:'#ffe43bff',width:410,height:84,layout:'row',design:'diagnostic',collection:'Reference matched'},
  {key:'ref-connection-stable',name:'Connection Stable',category:'Sci-Fi Diagnostics',glyph:'✓',primaryText:'CONNECTION 000.25',secondaryText:'LINK STABLE',accent:'#35e8ffff',width:410,height:84,layout:'row',design:'diagnostic',collection:'Reference matched'},
  {key:'ref-cyan-data-link',name:'Cyan Data Link',category:'Sci-Fi Diagnostics',glyph:'↯',primaryText:'CONNECTION 000.00',secondaryText:'UPLINK SYNCHRONIZED',accent:'#22dfffff',width:430,height:88,layout:'row',design:'notched-frame',collection:'Reference matched'},
  {key:'ref-target-bracket',name:'Target Bracket',category:'Cyberpunk Frames',glyph:'◇',primaryText:'SUBJECT 04',secondaryText:'TRACKING',accent:'#ff38eeff',width:230,height:230,layout:'column',design:'reticle',collection:'Reference matched'},
  {key:'ref-hex-tactical',name:'Hex Tactical Frame',category:'Cyberpunk Frames',glyph:'⬡',primaryText:'TACTICAL',secondaryText:'COMBAT VIEW',accent:'#fff141ff',width:360,height:188,layout:'column',design:'notched-frame',collection:'Reference matched'},
  {key:'ref-system-diagnostics',name:'System Diagnostics',category:'Sci-Fi Diagnostics',glyph:'SYS',primaryText:'SYSTEM 0.25',secondaryText:'ALL MODULES NOMINAL',accent:'#ffd936ff',width:330,height:112,layout:'column',design:'equalizer',collection:'Reference matched'},
  {key:'ref-value-readout',name:'Sci-Fi Value Readout',category:'Sci-Fi Diagnostics',glyph:'0.25',primaryText:'ENERGY VALUE',secondaryText:'CHANNEL A-07',accent:'#ffdd37ff',width:230,height:106,layout:'column',design:'diagnostic',collection:'Reference matched'},
];

export const hudPresets: HudPreset[] = [
  ...coreHudPresets.map(preset=>({...preset,design:'standard' as const,collection:'Core' as const})),
  ...referenceHudPresets,
];

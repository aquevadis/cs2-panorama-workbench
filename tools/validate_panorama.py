#!/usr/bin/env python3
import argparse, json, re, sys
from pathlib import Path
import xml.etree.ElementTree as ET

BROWSER_JS = re.compile(r'\b(window|document|localStorage|sessionStorage|fetch|XMLHttpRequest)\b')
HTML_TAGS = {'div','span','p','canvas','input','section','main','body','html','svg'}
CSS_DECL = re.compile(r'(?:\{|;)\s*([\w-]+)\s*:')

def source_files(path):
    return [path] if path.is_file() else [p for p in path.rglob('*') if p.suffix.lower() in {'.vxml','.xml','.vcss','.css','.js'}]

def main():
    ap=argparse.ArgumentParser(description='Conservative CS2 Panorama source validator')
    ap.add_argument('path'); ap.add_argument('--css-db'); ap.add_argument('--layout-db'); args=ap.parse_args()
    props=set(); tags=set()
    if args.css_db:
        props=set(json.load(open(args.css_db,encoding='utf-8'))['panorama_css']['properties'])
    if args.layout_db:
        rows=json.load(open(args.layout_db,encoding='utf-8'))['panorama_layouts']['layouts']
        for row in rows.values(): tags.update(row.get('tags',[]))
    errors=[]; warnings=[]; files=source_files(Path(args.path))
    for path in files:
        text=path.read_text(encoding='utf-8',errors='replace'); ext=path.suffix.lower()
        if ext in {'.vxml','.xml'}:
            try: root=ET.fromstring(text)
            except ET.ParseError as e: errors.append(f'{path}: XML parse error: {e}'); continue
            if root.tag!='root': warnings.append(f'{path}: root is <{root.tag}>, expected <root>')
            ids=[]
            for el in root.iter():
                if el.tag.lower() in HTML_TAGS: errors.append(f'{path}: browser HTML tag <{el.tag}>')
                elif tags and el.tag not in tags and el.tag not in {'root','styles','scripts','include','snippets','snippet'}:
                    warnings.append(f'{path}: <{el.tag}> absent from layout cache')
                if 'id' in el.attrib: ids.append(el.attrib['id'])
                if el.tag=='ParticleScenePanel' and el.attrib.get('startActive','').lower()=='true':
                    warnings.append(f'{path}: active ParticleScenePanel requires visibility stress test')
            for panel_id in set(ids):
                if ids.count(panel_id)>1: errors.append(f'{path}: duplicate id {panel_id}')
        elif ext in {'.vcss','.css'}:
            clean=re.sub(r'/\*.*?\*/','',text,flags=re.S)
            for prop in CSS_DECL.findall(clean):
                if props and prop not in props: errors.append(f'{path}: unknown VCSS property {prop}')
            if re.search(r'@media|var\(--|display\s*:\s*(flex|grid)|::(before|after)',clean):
                errors.append(f'{path}: browser-only CSS construct')
        elif ext=='.js':
            for match in BROWSER_JS.finditer(text): errors.append(f'{path}: browser API {match.group(1)}')
            if '$.Schedule' in text and '.IsValid()' not in text: warnings.append(f'{path}: scheduled callback lacks visible IsValid guard')
            for event in re.findall(r'RegisterForUnhandledEvent\(\s*["\']([^"\']+)',text):
                warnings.append(f'{path}: verify event in target build: {event}')
    for item in errors: print('ERROR',item)
    for item in warnings: print('WARN ',item)
    print(f'Checked {len(files)} files: {len(errors)} errors, {len(warnings)} warnings')
    return 1 if errors else 0

if __name__=='__main__': sys.exit(main())

/** Post-process Rsbuild's real React 19 output; do not substitute a mock runtime. */
import { readFileSync,writeFileSync,readdirSync,statSync,existsSync,mkdirSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
const files=[];
function walk(dir){if(!existsSync(dir))return;for(const name of readdirSync(dir)){const file=path.join(dir,name);if(statSync(file).isDirectory())walk(file);else files.push(file)}}
walk(dist);
const html=files.find(f=>f.endsWith('/index.html'));
if(!html)throw Error('Rsbuild did not emit index.html. Refusing fake standalone output.');
let body=readFileSync(html,'utf8');
const workerNames=['editor','ts','json','css','html'];
const workerSource={};
for(const name of workerNames){
 const matches=files.filter(f=>new RegExp(`(?:^|/)${name}\\.worker(?:\\.[^/]+)?\\.js$`).test(f));
 if(matches.length!==1)throw Error(`Expected one ${name} Monaco worker, found ${matches.length}; refusing incomplete standalone output`);
 const source=readFileSync(matches[0],'utf8');
 if(/\bimport\s*(?:\(|[{'"*])|importScripts\(/.test(source))throw Error(`${name} worker depends on further chunks; standalone closure failed`);
 workerSource[name==='ts'?'typescript':name]=source;
}
const safeSource=JSON.stringify(workerSource).replaceAll('<','\\u003c');
body=body.replace('</head>',`<script>globalThis.__WRKBENCH_EDITOR_WORKERS__=${safeSource};</script></head>`);
if(/<script[^>]+src\s*=|<link[^>]+rel=["']stylesheet["'][^>]+href\s*=/.test(body))throw Error('Standalone HTML contains external JS or CSS references');
const urls=[...body.matchAll(/url\(\s*['"]?(?!data:|blob:|#)([^)'"\s]+)/g)].map(m=>m[1]);
if(urls.length)throw Error(`Standalone HTML contains external CSS asset references: ${urls.slice(0,6).join(', ')}`);
const target=path.join(root,'Wrkbench_React19_Single.html');writeFileSync(target,body,'utf8');
console.log(`Wrote ${target} (${(Buffer.byteLength(body)/1e6).toFixed(2)} MB) with inline scripts, styles and Monaco worker`);
console.warn('Browser storage, popouts and window placement may require serving this file from localhost instead of file://.');

import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=path.resolve(import.meta.dirname,'..');
const files=[];
function walk(dir){for(const name of readdirSync(dir)){const file=path.join(dir,name);if(statSync(file).isDirectory())walk(file);else if(/\.(tsx?|mts)$/.test(name))files.push(file)}}
for(const d of ['apps','packages','features','tests'])walk(path.join(root,d));
let failed=0;
for(const f of files){const kind=f.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS;const source=ts.createSourceFile(f,readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true,kind);
 for(const e of source.parseDiagnostics){failed++;const {line,character}=source.getLineAndCharacterOfPosition(e.start??0);console.error(`${path.relative(root,f)}:${line+1}:${character+1} ${ts.flattenDiagnosticMessageText(e.messageText,' ')}`)} }
console.log(`Parsed ${files.length} TypeScript/TSX files: ${failed} syntax diagnostics`);
if(failed)process.exit(1);

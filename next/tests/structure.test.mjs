import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('package.json'));
const dev=pkg.devDependencies, deps=pkg.dependencies;

test('real architecture libraries, not emulated substitutes',()=>{
 assert.match(deps.react,/^\^19\./);
 for(const name of ['react-dom','cordis','dockview-react','dockview','@rsbuild/core','@rsbuild/plugin-react','tailwindcss','zod','zustand','wouter','@monaco-editor/react','monaco-editor','@xterm/xterm','@xterm/addon-fit']){
  assert.ok(deps[name],`Missing ${name}`);
 }
 assert.ok(dev.typescript,'Missing typescript');
 assert.ok(!deps['react16'],'Outdated runtime');
});
test('Dockview is actual layout owner',()=>{
 const source=read('apps/web/src/App.tsx');
 assert.match(source,/import\s*\{\s*DockviewReact/);
 assert.match(source,/from\s*'dockview-react'/);
 assert.match(source,/api\.fromJSON/);
 assert.match(source,/api\.toJSON/);
 assert.match(source,/closeEmptyGroups=\{false\}/);
 assert.match(source,/getTabContextMenuItems/);
 assert.doesNotMatch(source,/layoutHistory=\\{\\{enabled:true\\}\\}/);
 assert.doesNotMatch(source,/keyboardNavigation=\\{true\\}/);
 assert.match(source,/DockLayoutHistory/);
 assert.doesNotMatch(source,/class\s+(CustomDock|FakeDock|TabTree)/);
});
test('Cordis owns plugin lifecycle and feature registry',()=>{
 const source=read('packages/sdk/src/index.ts');
 assert.match(source,/import\s*\{\s*Context,\s*Service\s*\}\s*from\s*'cordis'/);
 assert.match(source,/root\.plugin\(feature\.activate\)/);
 assert.match(source,/ctx\.effect\(/);
 assert.match(source,/fiber\.dispose\(/);
 const features=path.join(root,'features');
 const entries=readdirSync(features,{withFileTypes:true}).filter(f=>f.isDirectory());
 assert.equal(entries.length,31);
 for(const dir of entries){
  const prefix=`features/${dir.name}/`;
  const manifest=JSON.parse(read(prefix+'package.json'));
  const plugin=read(prefix+'src/index.ts');
  assert.ok(manifest.name.startsWith('@wrkbench/feature-'));
  assert.match(plugin,/defineFeature\(/);
  assert.ok(existsSync(path.join(root,prefix+'src/index.ts')));
 }
});
test('local files are revision guarded by IndexedDB transaction; OPFS is nonauthoritative',()=>{
 const source=read('packages/storage/src/index.ts');
 assert.match(source,/indexedDB\.open/);
 assert.match(source,/transaction\('files','readwrite'\)/);
 assert.match(source,/expectedRevision/);
 assert.match(source,/FileConflictError/);
 assert.match(source,/navigator\.storage\?\.getDirectory/);
});
test('single-file step demands a genuine Rsbuild bundle',()=>{
 const source=read('scripts/inline-html.mjs');
 assert.match(source,/Rsbuild did not emit index\.html/);
 assert.match(source,/Standalone HTML contains external/);
 assert.match(read('rsbuild.config.ts'),/inlineScripts:\s*inline/);
 assert.match(read('rsbuild.config.ts'),/inlineStyles:\s*inline/);
});

test('every feature owns an actual renderer instead of shell renderer switch',()=>{
 const app=read('apps/web/src/App.tsx');
 assert.match(app,/catalog\.getView\(kind\)/);
 assert.doesNotMatch(app,/switch\s*\(kind\)/);
 const folders=readdirSync(path.join(root,'features'),{withFileTypes:true}).filter(f=>f.isDirectory());
 for(const folder of folders){
  const p='features/'+folder.name+'/src/';
  const plugin=read(p+'index.ts');
  assert.match(plugin,/defineFeature\(/);
  assert.match(plugin,/createElement\(/);
  assert.ok(existsSync(path.join(root,p+'view.tsx')),folder.name+' is missing its owned view');
  const view=read(p+'view.tsx');
  assert.doesNotMatch(view,/from ['"][.]{2}[/][.]{2}[/][.]{2}[/]apps[/]/);
 }
});
test('WindowManager is Cordis-owned and file changes are transaction scoped',()=>{
 const sdk=read('packages/sdk/src/index.ts');
 assert.match(sdk,/class WindowManager extends Service/);
 assert.match(sdk,/root\.plugin\(WindowManager\)/);
 assert.match(sdk,/ctx\.windowManager\.openView/);
 assert.doesNotMatch(sdk,/window\.dispatchEvent/);
 const storage=read('packages/storage/src/index.ts');
 assert.match(storage,/store\.get\(oldPath\)/);
 assert.match(storage,/store\.get\(newPath\)/);
 assert.match(storage,/BroadcastChannel/);
 assert.match(storage,/this\.emit\(\{type:'rename'/);
 const state=read('packages/client/src/state.ts');
 assert.match(state,/dirty:doc\.content!==savedContent/);
});

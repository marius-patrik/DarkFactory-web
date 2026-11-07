/**
 * Browser-local document authority.
 * IndexedDB is canonical; OPFS is an optional best-effort mirror only.
 * Writes, rename checks, and revision CAS happen inside one readwrite transaction.
 */
export type WorkspaceFile={path:string;content:string;revision:number;updatedAt:number};
export type FileChange={type:'save'|'rename'|'delete';path:string;previousPath?:string};
export class FileConflictError extends Error{constructor(public path:string){super(`Save conflict: ${path} changed in another tab`);this.name='FileConflictError'}}
export class BrowserFiles{
 private readonly dbName='wrkbench-client-v3';
 private pending:Promise<IDBDatabase>|null=null;
 private channel:BroadcastChannel|null=null;
 private readonly listeners=new Set<(event:FileChange)=>void>();
 private connect():Promise<IDBDatabase>{
  if(this.pending)return this.pending;
  this.pending=new Promise<IDBDatabase>((resolve,reject)=>{
   const req=indexedDB.open(this.dbName,3);
   req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'path'})};
   req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();this.pending=null};resolve(req.result)};
   req.onerror=()=>reject(req.error??new Error('IndexedDB unavailable'));
  }).catch(e=>{this.pending=null;throw e});
  return this.pending!;
 }
 subscribe(listener:(event:FileChange)=>void){
  this.listeners.add(listener);
  if(!this.channel&&typeof BroadcastChannel!=='undefined'){
   this.channel=new BroadcastChannel('wrkbench-files-v3');
   this.channel.onmessage=(message:MessageEvent<FileChange>)=>{const event=message.data;if(event&&['save','rename','delete'].includes(event.type))this.emit(event,false)};
  }
  return()=>{this.listeners.delete(listener)};
 }
 private emit(event:FileChange,broadcast=true){
  for(const listener of this.listeners)listener(event);
  if(broadcast)this.channel?.postMessage(event);
 }
 private validatePath(path:string){
  if(!path||path.length>1024||path.startsWith('/')||path.includes('\\')||path.includes('//')||path.split('/').some(part=>!part||part==='.'||part==='..')||/[\x00-\x1f]/.test(path))throw new Error('Invalid workspace-relative path');
 }
 private async read<T>(req:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error??new Error('IndexedDB request failed'))});
 }
 async get(path:string):Promise<WorkspaceFile|undefined>{
  if(!path)return undefined;this.validatePath(path);
  const db=await this.connect();const tx=db.transaction('files','readonly');
  return this.read<WorkspaceFile|undefined>(tx.objectStore('files').get(path));
 }
 async list():Promise<WorkspaceFile[]>{
  const db=await this.connect();const tx=db.transaction('files','readonly');
  return this.read<WorkspaceFile[]>(tx.objectStore('files').getAll());
 }
 async save(path:string,content:string,expectedRevision?:number):Promise<WorkspaceFile>{
  this.validatePath(path);const db=await this.connect();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('files','readwrite'),store=tx.objectStore('files');
   let result:WorkspaceFile|undefined,conflict=false;
   const req=store.get(path);
   req.onsuccess=()=>{
    const old=req.result as WorkspaceFile|undefined;
    if(expectedRevision!==undefined&&(old?.revision??0)!==expectedRevision){conflict=true;tx.abort();return}
    result={path,content,revision:(old?.revision??0)+1,updatedAt:Date.now()};
    store.put(result);
   };
   tx.oncomplete=()=>{
    if(!result){reject(new Error('Document write did not commit'));return}
    this.emit({type:'save',path});void this.mirrorOPFS(result);resolve(result);
   };
   tx.onabort=()=>reject(conflict?new FileConflictError(path):tx.error??new Error('IndexedDB write aborted'));
   tx.onerror=()=>reject(tx.error??new Error('IndexedDB write failed'));
  });
 }
 async remove(path:string){
  this.validatePath(path);const db=await this.connect();
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('files','readwrite');
   tx.objectStore('files').delete(path);
   tx.oncomplete=()=>resolve();
   tx.onabort=()=>reject(tx.error??new Error('Delete aborted'));
   tx.onerror=()=>reject(tx.error??new Error('Delete failed'));
  });
  this.emit({type:'delete',path});
 }
 /** Both checks and writes occur inside the same IndexedDB transaction. */
 async rename(oldPath:string,newPath:string){
  this.validatePath(oldPath);this.validatePath(newPath);if(oldPath===newPath)return;
  const db=await this.connect();
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('files','readwrite'),store=tx.objectStore('files');
   let error:Error|null=null;
   const source=store.get(oldPath);
   source.onsuccess=()=>{
    const existing=source.result as WorkspaceFile|undefined;
    if(!existing){error=new Error('Source file not found');tx.abort();return}
    const dest=store.get(newPath);
    dest.onsuccess=()=>{
     if(dest.result){error=new Error('Destination file exists');tx.abort();return}
     store.put({...existing,path:newPath,revision:existing.revision+1,updatedAt:Date.now()});
     store.delete(oldPath);
    };
   };
   tx.oncomplete=()=>resolve();
   tx.onabort=()=>reject(error??tx.error??new Error('Rename aborted'));
   tx.onerror=()=>reject(tx.error??new Error('Rename failed'));
  });
  this.emit({type:'rename',path:newPath,previousPath:oldPath});
 }
 async seed(seed:Record<string,string>){
  for(const [path,content] of Object.entries(seed)){
   if(await this.get(path))continue;
   try{await this.save(path,content,0)}catch(e){if(!(e instanceof FileConflictError))throw e}
  }
 }
 private async mirrorOPFS(file:WorkspaceFile){
  try{
   const root=await navigator.storage?.getDirectory?.();if(!root)return;
   const directory=await root.getDirectoryHandle('wrkbench-cache',{create:true});
   const handle=await directory.getFileHandle(encodeURIComponent(file.path),{create:true});
   const writable=await handle.createWritable();await writable.write(file.content);await writable.close();
  }catch{/* Only IndexedDB is authoritative. */}
 }
}

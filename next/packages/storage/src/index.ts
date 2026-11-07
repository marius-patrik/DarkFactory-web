/** Atomic IndexedDB document authority, with OPFS as a best-effort content cache. */
export type WorkspaceFile={path:string;content:string;revision:number;updatedAt:number};
export class FileConflictError extends Error{constructor(public path:string){super(`Save conflict: ${path} changed in another tab`);}}
export class BrowserFiles{
  private readonly dbName='wrkbench-client-v3';
  private pending:Promise<IDBDatabase>|null=null;
  private connect():Promise<IDBDatabase>{
    if(this.pending)return this.pending;
    this.pending=new Promise((resolve,reject)=>{const req=indexedDB.open(this.dbName,3);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'path'});};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });return this.pending;
  }
  private async readReq<T>(tx:IDBTransaction, req:IDBRequest<T>):Promise<T>{
    return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onabort=()=>reject(tx.error);});
  }
  async get(path:string):Promise<WorkspaceFile|undefined>{const db=await this.connect();const tx=db.transaction('files','readonly'); return this.readReq(tx,tx.objectStore('files').get(path));}
  async list():Promise<WorkspaceFile[]>{const db=await this.connect();const tx=db.transaction('files','readonly');return this.readReq(tx,tx.objectStore('files').getAll());}
  async save(path:string,content:string,expectedRevision?:number):Promise<WorkspaceFile>{
    const db=await this.connect();return new Promise((resolve,reject)=>{
      const tx=db.transaction('files','readwrite');const store=tx.objectStore('files');let result:WorkspaceFile|undefined;let failed=false;
      const get=store.get(path);get.onsuccess=()=>{const existing=get.result as WorkspaceFile|undefined;
        if(expectedRevision!==undefined&&(existing?.revision??0)!==expectedRevision){failed=true;tx.abort();return;}
        result={path,content,revision:(existing?.revision??0)+1,updatedAt:Date.now()};store.put(result);
      };
      tx.oncomplete=()=>{if(!result){reject(new Error('Document save was not committed'));return;}void this.mirrorOPFS(result);resolve(result)};
      tx.onerror=()=>reject(tx.error??new Error('IndexedDB write failed'));
      tx.onabort=()=>reject(failed?new FileConflictError(path):tx.error??new Error('Transaction aborted'));
    });
  }
  async remove(path:string){const db=await this.connect();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(path);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  async rename(oldPath:string,newPath:string){
    const existing=await this.get(oldPath);if(!existing)throw new Error('Source file not found');
    // Cross-record replacement belongs in one IndexedDB transaction.
    const db=await this.connect();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');const store=tx.objectStore('files');
      const req=store.get(newPath);req.onsuccess=()=>{if(req.result){tx.abort();return;}store.put({...existing,path:newPath,revision:existing.revision+1,updatedAt:Date.now()});store.delete(oldPath)};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('Destination exists or rename aborted'));tx.onerror=()=>reject(tx.error);
    });
  }
  async seed(files:Record<string,string>){const existing=await this.list();for(const [path,content]of Object.entries(files)){if(await this.get(path))continue;try{await this.save(path,content,0)}catch(e){if(!(e instanceof FileConflictError))throw e}}}
  private async mirrorOPFS(file:WorkspaceFile){try{const root=await navigator.storage?.getDirectory?.();if(!root)return;
    const dir=await root.getDirectoryHandle('wrkbench-cache',{create:true});const handle=await dir.getFileHandle(encodeURIComponent(file.path),{create:true});
    const writable=await handle.createWritable();await writable.write(file.content);await writable.close();
  }catch{/* IndexedDB is authoritative; OPFS is optional and fallible. */}}
}

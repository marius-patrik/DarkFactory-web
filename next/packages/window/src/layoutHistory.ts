import type {DockviewApi} from 'dockview-react';
type Snapshot=ReturnType<DockviewApi['toJSON']>;
export type HistoryState={canUndo:boolean;canRedo:boolean};
/**
 * A bounded sequence of snapshots read *from* Dockview; never a competing
 * writable layout model. Only DockviewApi.fromJSON can change placement.
 * This intentionally uses the MIT Dockview core; Enterprise modules are not required.
 */
export class DockLayoutHistory {
 private readonly undoStack:Snapshot[]=[];
 private readonly redoStack:Snapshot[]=[];
 private current:Snapshot;
 private restoring=false;
 private readonly unsubscribe:{dispose:()=>void};
 constructor(private readonly api:DockviewApi,private readonly changed:(state:HistoryState)=>void){
  this.current=api.toJSON();
  this.unsubscribe=api.onDidLayoutChange(()=>this.capture());
  this.emit();
 }
 get canUndo(){return this.undoStack.length>0}
 get canRedo(){return this.redoStack.length>0}
 private emit(){this.changed({canUndo:this.canUndo,canRedo:this.canRedo})}
 private capture(){
  if(this.restoring)return;
  const snapshot=this.api.toJSON();
  if(JSON.stringify(snapshot)===JSON.stringify(this.current))return;
  this.undoStack.push(this.current);
  if(this.undoStack.length>48)this.undoStack.shift();
  this.current=snapshot;this.redoStack.length=0;this.emit();
 }
 private restore(snapshot:Snapshot){
  this.restoring=true;
  try{this.api.fromJSON(snapshot,{reuseExistingPanels:false});this.current=snapshot}
  finally{this.restoring=false;this.emit()}
 }
 undo(){const previous=this.undoStack.pop();if(!previous)return;this.redoStack.push(this.current);this.restore(previous)}
 redo(){const next=this.redoStack.pop();if(!next)return;this.undoStack.push(this.current);this.restore(next)}
 dispose(){this.unsubscribe.dispose()}
}

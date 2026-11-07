import {Context,Service} from 'cordis';
import type {ComponentType} from 'react';
import {z} from 'zod';
import {ToolRegistry,type FeatureDefinition,type ViewKind,type WorkbenchId} from '../../core/src/index.ts';
export interface FeatureViewProps {viewId:string;params:Record<string,unknown>}
export type FeatureRenderer=ComponentType<FeatureViewProps>;
export interface WindowPort {
 openView:(kind:ViewKind,params?:Record<string,unknown>)=>void;
 openFile:(path:string)=>void;
 moveTab:(panelId:string,target:WorkbenchId)=>void;
 renameFile:(from:string,to:string)=>void;
 deleteFile:(path:string)=>void;
}
export class FeatureCatalog extends Service {
 private entries=new Map<ViewKind,{definition:FeatureDefinition;render:FeatureRenderer}>();
 private listeners=new Set<()=>void>();
 constructor(ctx:Context){super(ctx,'featureCatalog')}
 add(definition:FeatureDefinition,render:FeatureRenderer){
  if(this.entries.has(definition.id))throw new Error(`Plugin already registered: ${definition.id}`);
  const item={definition,render};this.entries.set(definition.id,item);this.emit();
  return ()=>{if(this.entries.get(definition.id)===item){this.entries.delete(definition.id);this.emit()}};
 }
 subscribe(listener:()=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
 private emit(){for(const listener of this.listeners)listener()}
 list(){return [...this.entries.values()].map(entry=>entry.definition)}
 get(id:string){return this.entries.get(id as ViewKind)?.definition}
 getView(id:string){return this.entries.get(id as ViewKind)?.render}
}
export class ToolService extends Service{
 readonly registry=new ToolRegistry();
 constructor(ctx:Context){super(ctx,'toolService')}
}
/** Cordis-owned command port; the Dockview adapter remains the only layout authority. */
export class WindowManager extends Service{
 private port:WindowPort|null=null;
 constructor(ctx:Context){super(ctx,'windowManager')}
 attach(port:WindowPort){if(this.port)throw new Error('WindowManager already attached');this.port=port;return ()=>{if(this.port===port)this.port=null}}
 private requirePort():WindowPort{if(!this.port)throw new Error('Dockview adapter unavailable');return this.port}
 openView(kind:ViewKind,params?:Record<string,unknown>){this.requirePort().openView(kind,params)}
 openFile(path:string){this.requirePort().openFile(path)}
 moveTab(panelId:string,target:WorkbenchId){this.requirePort().moveTab(panelId,target)}
 renameFile(from:string,to:string){this.requirePort().renameFile(from,to)}
 deleteFile(path:string){this.requirePort().deleteFile(path)}
}
declare module 'cordis'{interface Context{featureCatalog:FeatureCatalog;toolService:ToolService;windowManager:WindowManager}}
export function defineFeature(definition:FeatureDefinition,render:FeatureRenderer){
 const activate=Object.assign((ctx:Context)=>{
  ctx.effect(()=>{
   const removeView=ctx.featureCatalog.add(definition,render);
   const removeTool=ctx.toolService.registry.register({
    id:`feature.${definition.id}.open`,label:`Open ${definition.title}`,
    description:`Open ${definition.title} in the active Dockview group`,
    input:z.object({}),output:z.object({message:z.string()}),
    run:()=>{ctx.windowManager.openView(definition.id);return {message:`Opened ${definition.title}`}}
   });
   return ()=>{removeTool();removeView()};
  });
 },{inject:['featureCatalog','toolService','windowManager'] as string[]});
 return {definition,activate,render};
}
export async function createClientHost(plugins:ReadonlyArray<{activate:(ctx:Context)=>void}>){
 const root=new Context();
 await root.plugin(FeatureCatalog);await root.plugin(ToolService);await root.plugin(WindowManager);
 for(const feature of plugins)await root.plugin(feature.activate);
 return {root,catalog:root.featureCatalog,toolRegistry:root.toolService.registry,windowManager:root.windowManager,dispose:()=>root.fiber.dispose()};
}

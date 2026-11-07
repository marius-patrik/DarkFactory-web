import { Context, Service } from 'cordis';
import {z} from 'zod';
import {ToolRegistry, type FeatureDefinition} from '../../core/src/index.ts';
export class FeatureCatalog extends Service {
  private entries = new Map<string,FeatureDefinition>();
  constructor(ctx:Context){ super(ctx,'featureCatalog'); }
  add(def:FeatureDefinition){ if(this.entries.has(def.id))throw new Error(`Feature ${def.id} already active`);this.entries.set(def.id,def);return ()=>this.entries.delete(def.id);}
  list(){return [...this.entries.values()];}
  get(id:string){return this.entries.get(id);}
}
export class ToolService extends Service {
 readonly registry=new ToolRegistry();
 constructor(ctx:Context){super(ctx,'toolService');}
}
declare module 'cordis' { interface Context {featureCatalog:FeatureCatalog;toolService:ToolService} }
export function defineFeature(definition:FeatureDefinition){
  const activate=Object.assign((ctx:Context)=>{
    ctx.effect(()=>{
      const removeView=ctx.featureCatalog.add(definition);
      const removeTool=ctx.toolService.registry.register({
        id:`feature.${definition.id}.open`,label:`Open ${definition.title}`,
        description:`Open the ${definition.title} plugin view in the active Dockview group`,
        input:z.object({}),output:z.object({message:z.string()}),
        run:()=>{window.dispatchEvent(new CustomEvent('wrkbench:openkind',{detail:definition.id}));return {message:`Opening ${definition.title}`};}
      });
      return ()=>{removeTool();removeView()};
    });
  },{inject:['featureCatalog','toolService'] as string[]});
  return {definition,activate};
}
export async function createClientHost(plugins:ReadonlyArray<{activate:(ctx:Context)=>void}>){
  const root=new Context(); await root.plugin(FeatureCatalog);await root.plugin(ToolService);
  for(const feature of plugins) await root.plugin(feature.activate);
  return { root, catalog:root.featureCatalog, toolRegistry:root.toolService.registry, dispose:()=>root.fiber.dispose() };
}

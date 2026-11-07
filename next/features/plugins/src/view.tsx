import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {ViewKind,FeatureDefinition} from '../../../packages/core/src/index.ts';
import {uniqueId} from '../../../packages/core/src/index.ts';
import {useUI,RUNTIMES,resolvedContext} from '../../../packages/client/src/state.ts';
import {Icon} from '../../../packages/ui/src/icons.tsx';
import {notify,tools,invocationContext,openPluginView} from '../../../packages/client/src/services.ts';
import {ToolbarButton,ViewToolbar} from '../../../packages/ui/src/components.tsx';
export function PluginsView({features,disable}:{features:FeatureDefinition[];disable:(id:string)=>void}){return <div className="view vertical"><ViewToolbar label="Extensions"><span className="chip subtle">CORDIS LIFECYCLE</span></ViewToolbar><div className="plugin-list">{features.map(feature=><div className="plugin-row" key={feature.id}><div className="plugin-glyph"><Icon name={feature.icon}/></div><div><strong>{feature.title}</strong><small>{feature.description}</small></div><button title={`Open ${feature.title} view`} onClick={()=>openPluginView(feature.id)}>Open</button></div>)}</div><p className="view-notice">Feature packages are registered as Cordis plugins, with lifecycle-managed contributions. Third-party code execution is not enabled.</p></div>}

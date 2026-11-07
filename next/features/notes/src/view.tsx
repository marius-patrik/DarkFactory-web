import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {ViewKind,FeatureDefinition} from '../../../packages/core/src/index.ts';
import {uniqueId} from '../../../packages/core/src/index.ts';
import {useUI,RUNTIMES,resolvedContext} from '../../../packages/client/src/state.ts';
import {Icon} from '../../../packages/ui/src/icons.tsx';
import {notify,tools,invocationContext,openPluginView} from '../../../packages/client/src/services.ts';
import {ToolbarButton,ViewToolbar} from '../../../packages/ui/src/components.tsx';
export function LocalNotes({id='personal'}:{id?:string}){const content=useUI(s=>s.notes[id]??''),set=useUI(s=>s.setNote);return <div className="view vertical"><ViewToolbar label="Notes"><span className="chip subtle">AUTOSAVED</span></ViewToolbar><textarea className="writing-area" aria-label="Notes editor" value={content} onChange={e=>set(id,e.target.value)} placeholder="Start writing…" /></div>}

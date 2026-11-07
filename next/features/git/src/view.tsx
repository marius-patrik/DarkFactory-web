import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {ViewKind,FeatureDefinition} from '../../../packages/core/src/index.ts';
import {uniqueId} from '../../../packages/core/src/index.ts';
import {useUI,RUNTIMES,resolvedContext} from '../../../packages/client/src/state.ts';
import {Icon} from '../../../packages/ui/src/icons.tsx';
import {notify,tools,invocationContext,openPluginView} from '../../../packages/client/src/services.ts';
import {ToolbarButton,ViewToolbar} from '../../../packages/ui/src/components.tsx';
export function GitView(){return <div className="view vertical"><ViewToolbar label="Source control"/><div className="feature-section"><div className="section-label">REPOSITORY STATUS</div><div className="status-card"><Icon name="git" size={19}/><div><strong>No repository provider connected</strong><p>Browser-local files do not automatically represent a Git checkout. Connect an authorized local or remote Git provider in Phase 2.</p></div></div></div><div className="feature-section"><button className="outline-button" title="Explore browser-local files" onClick={()=>openPluginView('explorer')}><Icon name="folder"/> Open Explorer</button></div></div>}

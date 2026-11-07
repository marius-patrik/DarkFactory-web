import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {ViewKind,FeatureDefinition} from '../../../packages/core/src/index.ts';
import {uniqueId} from '../../../packages/core/src/index.ts';
import {useUI,RUNTIMES,resolvedContext} from '../../../packages/client/src/state.ts';
import {Icon} from '../../../packages/ui/src/icons.tsx';
import {notify,tools,invocationContext,openPluginView} from '../../../packages/client/src/services.ts';
import {ToolbarButton,ViewToolbar} from '../../../packages/ui/src/components.tsx';
export function ChartView(){const data=[18,31,24,42,36,48,42,53,43,65,60,79,73,92];return <div className="view vertical"><ViewToolbar label="Chart"><span className="chip warning-chip">SAMPLE DATA</span></ViewToolbar><div className="chart-content"><h3>Project activity</h3><p>Illustrative local dataset · 14 periods</p><div className="bar-chart">{data.map((v,i)=><div key={i} className="bar-wrap" title={`Period ${i+1}: ${v}`}><div style={{height:`${v}%`}}/><small>{i+1}</small></div>)}</div></div></div>}

import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {AgentView} from './view.tsx';
export const plugin=defineFeature({"id":"agent","title":"Agent","category":"Development","icon":"bot","description":"Agent sessions and consent-gated tools"},({viewId,params})=>createElement(AgentView,{id:viewId}));
export default plugin;

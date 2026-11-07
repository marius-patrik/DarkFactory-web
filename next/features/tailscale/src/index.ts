import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"tailscale","title":"Tailscale","category":"Operations","icon":"network","description":"Connectivity and device view"},({viewId,params})=>createElement(CapabilityView,{kind:'tailscale'}));
export default plugin;

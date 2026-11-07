import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"runtime","title":"Runtimes","category":"Operations","icon":"server","description":"Runtime profiles and selections"},({viewId,params})=>createElement(CapabilityView,{kind:'runtime'}));
export default plugin;

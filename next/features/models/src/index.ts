import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"models","title":"Models","category":"Operations","icon":"cpu","description":"Model endpoint and capabilities"},({viewId,params})=>createElement(CapabilityView,{kind:'models'}));
export default plugin;

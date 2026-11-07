import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"tests","title":"Tests","category":"Development","icon":"flask","description":"Test runs and summaries"},({viewId,params})=>createElement(CapabilityView,{kind:'tests'}));
export default plugin;

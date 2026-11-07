import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {ChartView} from './view.tsx';
export const plugin=defineFeature({"id":"chart","title":"Charts","category":"Research","icon":"chart","description":"Visualization of demo datasets"},({viewId,params})=>createElement(ChartView,null));
export default plugin;

import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {PlannerView} from './view.tsx';
export const plugin=defineFeature({"id":"planner","title":"Planner","category":"Research","icon":"check","description":"Tasks and planning"},({viewId,params})=>createElement(PlannerView,null));
export default plugin;

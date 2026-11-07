import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"news","title":"News","category":"Research","icon":"rss","description":"Research feed with locally seeded stories"},({viewId,params})=>createElement(CapabilityView,{kind:'news'}));
export default plugin;

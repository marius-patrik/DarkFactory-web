import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"debug","title":"Debug","category":"Development","icon":"bug","description":"Debug capabilities and run controls"},({viewId,params})=>createElement(CapabilityView,{kind:'debug'}));
export default plugin;

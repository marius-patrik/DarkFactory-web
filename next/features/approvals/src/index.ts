import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"approvals","title":"Approvals","category":"System","icon":"shield","description":"Review tool permissions"},({viewId,params})=>createElement(CapabilityView,{kind:'approvals'}));
export default plugin;

import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"preview","title":"Preview","category":"Creative","icon":"play","description":"Preview media and documents"},({viewId,params})=>createElement(CapabilityView,{kind:'preview'}));
export default plugin;

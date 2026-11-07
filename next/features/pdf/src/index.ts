import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"pdf","title":"PDF","category":"Research","icon":"file","description":"Local PDF previews"},({viewId,params})=>createElement(CapabilityView,{kind:'pdf'}));
export default plugin;

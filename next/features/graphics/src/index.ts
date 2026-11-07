import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"graphics","title":"Graphics","category":"Creative","icon":"paintbrush","description":"Visual asset sketch surface"},({viewId,params})=>createElement(CapabilityView,{kind:'graphics'}));
export default plugin;

import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"browser","title":"Browser","category":"Research","icon":"globe","description":"URL and research collection"},({viewId,params})=>createElement(CapabilityView,{kind:'browser'}));
export default plugin;

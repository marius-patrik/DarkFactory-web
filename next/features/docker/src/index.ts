import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"docker","title":"Docker","category":"Operations","icon":"box","description":"Container connection UI and capability reporting"},({viewId,params})=>createElement(CapabilityView,{kind:'docker'}));
export default plugin;

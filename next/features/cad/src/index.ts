import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CapabilityView} from './view.tsx';
export const plugin=defineFeature({"id":"cad","title":"CAD","category":"Creative","icon":"box","description":"Geometry workspace interface"},({viewId,params})=>createElement(CapabilityView,{kind:'cad'}));
export default plugin;

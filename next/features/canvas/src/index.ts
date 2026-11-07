import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CanvasView} from './view.tsx';
export const plugin=defineFeature({"id":"canvas","title":"Canvas","category":"Creative","icon":"workflow","description":"Freeform draggable canvas"},({viewId,params})=>createElement(CanvasView,null));
export default plugin;

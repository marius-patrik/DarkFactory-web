import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {SheetView} from './view.tsx';
export const plugin=defineFeature({"id":"sheets","title":"Sheets","category":"Creative","icon":"table","description":"Local tabular editing"},({viewId,params})=>createElement(SheetView,{id:viewId}));
export default plugin;

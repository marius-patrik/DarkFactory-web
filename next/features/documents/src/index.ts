import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {DocumentView} from './view.tsx';
export const plugin=defineFeature({"id":"documents","title":"Documents","category":"Creative","icon":"file-text","description":"Rich document editing"},({viewId,params})=>createElement(DocumentView,{id:viewId}));
export default plugin;

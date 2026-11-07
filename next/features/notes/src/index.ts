import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {LocalNotes} from './view.tsx';
export const plugin=defineFeature({"id":"notes","title":"Notes","category":"Research","icon":"notebook","description":"Local text note editor"},({viewId,params})=>createElement(LocalNotes,{id:viewId}));
export default plugin;

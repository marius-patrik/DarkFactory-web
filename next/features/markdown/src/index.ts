import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {MarkdownView} from './view.tsx';
export const plugin=defineFeature({"id":"markdown","title":"Markdown","category":"Research","icon":"file-text","description":"Markdown editor with preview"},({viewId,params})=>createElement(MarkdownView,{path:typeof params.path==='string'?params.path:undefined}));
export default plugin;

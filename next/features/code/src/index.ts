import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {CodeView} from './view.tsx';
export const plugin=defineFeature({"id":"code","title":"Code","category":"Development","icon":"code","description":"Edit source documents with Monaco"},({viewId,params})=>createElement(CodeView,{path:typeof params.path==='string'?params.path:undefined}));
export default plugin;

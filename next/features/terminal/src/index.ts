import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {TerminalView} from './view.tsx';
export const plugin=defineFeature({"id":"terminal","title":"Terminal","category":"Development","icon":"terminal","description":"Browser-local terminal interface and command history"},({viewId,params})=>createElement(TerminalView,{id:viewId}));
export default plugin;

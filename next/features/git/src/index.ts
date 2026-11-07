import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {GitView} from './view.tsx';
export const plugin=defineFeature({"id":"git","title":"Git","category":"Development","icon":"git-branch","description":"Inspect local version-control status"},({viewId,params})=>createElement(GitView,null));
export default plugin;

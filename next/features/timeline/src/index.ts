import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {TimelineView} from './view.tsx';
export const plugin=defineFeature({"id":"timeline","title":"Timeline","category":"Creative","icon":"list","description":"Non-destructive clip arrangement"},({viewId,params})=>createElement(TimelineView,{id:viewId}));
export default plugin;

import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {ExplorerView} from './view.tsx';
import {windowActions} from '../../../packages/client/src/services.ts';
export const plugin=defineFeature({"id":"explorer","title":"Explorer","category":"Development","icon":"folder","description":"Browse and open local workspace files"},({viewId,params})=>createElement(ExplorerView,{onOpen:windowActions.openFile}));
export default plugin;

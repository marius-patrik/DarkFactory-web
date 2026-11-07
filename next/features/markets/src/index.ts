import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {MarketsView} from './view.tsx';
export const plugin=defineFeature({"id":"markets","title":"Markets","category":"Research","icon":"chart","description":"Market watchlist with demo-only data"},({viewId,params})=>createElement(MarketsView,null));
export default plugin;

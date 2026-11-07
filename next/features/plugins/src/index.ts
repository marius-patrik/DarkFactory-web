import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {PluginsView} from './view.tsx';
import {listFeatures} from '../../../packages/client/src/services.ts';
export const plugin=defineFeature({"id":"plugins","title":"Extensions","category":"System","icon":"puzzle","description":"Installed Cordis plugin inventory"},({viewId,params})=>createElement(PluginsView,{features:listFeatures(),disable:()=>{}}));
export default plugin;

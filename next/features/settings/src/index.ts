import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {SettingsView} from './view.tsx';
export const plugin=defineFeature({"id":"settings","title":"Settings","category":"System","icon":"settings","description":"Client preferences"},({viewId,params})=>createElement(SettingsView,null));
export default plugin;

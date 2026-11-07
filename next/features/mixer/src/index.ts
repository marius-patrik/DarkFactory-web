import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {MixerView} from './view.tsx';
export const plugin=defineFeature({"id":"mixer","title":"Mixer","category":"Creative","icon":"sliders","description":"Track volume and mute controls"},({viewId,params})=>createElement(MixerView,null));
export default plugin;

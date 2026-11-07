import {createElement} from 'react';
import {defineFeature} from '../../../packages/sdk/src/index.ts';
import {DeckView} from './view.tsx';
export const plugin=defineFeature({"id":"decks","title":"Decks","category":"Creative","icon":"presentation","description":"Slide outline editing"},({viewId,params})=>createElement(DeckView,{id:viewId}));
export default plugin;

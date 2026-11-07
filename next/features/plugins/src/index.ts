import { defineFeature } from '../../../packages/sdk/src/index.ts';
export const plugin = defineFeature({id:'plugins',title:'Extensions',category:'System',icon:'puzzle',description:'Installed Cordis plugin inventory'});
export default plugin;

import { defineFeature } from '../../../packages/sdk/src/index.ts';
export const plugin = defineFeature({id:'settings',title:'Settings',category:'System',icon:'settings',description:'Client preferences'});
export default plugin;

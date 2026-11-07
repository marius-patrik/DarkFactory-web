import { defineFeature } from '../../../packages/sdk/src/index.ts';
export const plugin = defineFeature({id:'news',title:'News',category:'Research',icon:'rss',description:'Research feed with locally seeded stories'});
export default plugin;

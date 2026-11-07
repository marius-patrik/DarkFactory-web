import { defineFeature } from '../../../packages/sdk/src/index.ts';
export const plugin = defineFeature({id:'git',title:'Git',category:'Development',icon:'git-branch',description:'Inspect local version-control status'});
export default plugin;

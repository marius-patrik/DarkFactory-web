/** These require a successful real Bun install and HTTP origin; never run using page.setContent. */
import {test,expect} from '@playwright/test';

async function boot(page:import('@playwright/test').Page){
 const exceptions:string[]=[];
 page.on('pageerror',e=>exceptions.push(e.message));
 await page.goto('/workbench/development',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('navigation',{name:'Workbenches'})).toBeVisible();
 await expect(page.locator('.dv-groupview').first()).toBeVisible();
 return exceptions;
}

test('loads real Cordis-backed feature host and Dockview over HTTP',async({page})=>{
 const exceptions=await boot(page);
 await expect(page.getByRole('button',{name:'Split',exact:true})).toBeVisible();
 await expect(page.locator('.dv-tab').first()).toBeVisible();
 expect(exceptions).toEqual([]);
});

test('switches workbenches without discarding individual layouts',async({page})=>{
 const exceptions=await boot(page);
 await page.getByRole('button',{name:'Split',exact:true}).click();
 const before=await page.locator('.dv-groupview').count();
 expect(before).toBeGreaterThan(1);
 await page.getByRole('button',{name:'Research workbench'}).click();
 await expect(page).toHaveURL(/workbench\/research/);
 await page.getByRole('button',{name:'Development workbench'}).click();
 await expect(page.locator('.dv-groupview')).toHaveCount(before);
 expect(exceptions).toEqual([]);
});

test('command palette, contextual status menus and appearance',async({page})=>{
 const exceptions=await boot(page);
 await page.getByTitle('Open tool palette (⌘/Ctrl+K)').click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await page.getByTitle('Open context switcher').click();
 await expect(page.getByRole('menu')).toBeVisible();
 await page.keyboard.press('Escape');
 await page.getByTitle('Open display manager').click();
 await expect(page.getByRole('menu')).toBeVisible();
 await page.keyboard.press('Escape');
 const before=await page.locator('.app').getAttribute('class');
 await page.getByTitle(/Switch to (light|dark) mode/).click();
 expect(await page.locator('.app').getAttribute('class')).not.toBe(before);
 await page.reload();
 await expect(page.locator('.app')).not.toHaveAttribute('class',before??'');
 expect(exceptions).toEqual([]);
});

test('local file survives real navigation and browser reload',async({page})=>{
 const exceptions=await boot(page);
 page.once('dialog',d=>void d.accept('src/acceptance-check.ts'));
 await page.getByRole('button',{name:'New local file'}).click();
 await expect(page.locator('.dv-groupview').first()).toBeVisible();
 await page.reload();
 await expect(page.locator('.dv-groupview').first()).toBeVisible();
 await expect(page.getByText('acceptance-check.ts').first()).toBeVisible();
 expect(exceptions).toEqual([]);
});

test('a tab moves into another editor group through native Dockview dragging',async({page})=>{
 const exceptions=await boot(page);
 const explorer=page.getByRole('tab',{name:'Explorer',exact:true});
 const agent=page.getByRole('tab',{name:'Agent',exact:true});
 await expect(explorer).toBeVisible();
 await expect(agent).toBeVisible();
 await explorer.dragTo(agent);
 const agentGroup=agent.locator('xpath=ancestor::*[contains(@class,"dv-groupview")][1]');
 await expect(agentGroup.getByRole('tab',{name:'Explorer',exact:true})).toBeVisible();
 expect(exceptions).toEqual([]);
});

test('layout snapshot undo and redo restore Dockview groups',async({page})=>{
 const exceptions=await boot(page);
 const initial=await page.locator('.dv-groupview').count();
 await page.getByRole('button',{name:'Split',exact:true}).click();
 await expect(page.locator('.dv-groupview')).toHaveCount(initial+1);
 await page.getByRole('button',{name:'Undo layout change'}).click();
 await expect(page.locator('.dv-groupview')).toHaveCount(initial);
 await page.getByRole('button',{name:'Redo layout change'}).click();
 await expect(page.locator('.dv-groupview')).toHaveCount(initial+1);
 expect(exceptions).toEqual([]);
});

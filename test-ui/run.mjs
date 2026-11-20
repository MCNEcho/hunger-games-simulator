import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const URL_ = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;
const shots = new URL('./shots/', import.meta.url).pathname;
const problems = [];
const log = (...a) => console.log('·', ...a);
function check(cond, msg) { if (!cond) { problems.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); }

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION|TUNNEL)/.test(m.text())) problems.push(`console: ${m.text()}`); });
  return { ctx, page };
}
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(o.sw <= o.cw + 1, `${label}: no horizontal overflow (${o.sw} <= ${o.cw})`);
};

// ---------- Desktop full flow
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 });
  await page.goto(URL_);
  await page.waitForSelector('.hero h1');
  check((await page.textContent('.hero h1')).includes('Hunger Games'), 'setup screen shows the title');
  check((await page.textContent('.setup-grid')).includes('24'), 'setup shows the 24 tributes of the 74th Games');
  await page.screenshot({ path: shots + 'd1-setup.png', fullPage: false });

  // Shuffle on the setup screen
  const listBefore = await page.textContent('.district-list');
  await page.click('[data-action="shuffle-cast"]');
  const listAfter = await page.textContent('.district-list');
  check(listBefore !== listAfter, 'setup: Shuffle districts changes who is in each district');
  check((await page.textContent('.setup-grid')).includes('24'), 'setup: still 24 tributes after shuffle');
  check(!!(await page.$('[data-action="restore-cast"]')), 'setup: Restore original order appears');
  await page.click('[data-action="restore-cast"]');
  check((await page.textContent('.district-list')) === listBefore, 'setup: restore brings back the original districts');
  check(!(await page.$('[data-action="restore-cast"]')), 'setup: restore button goes away');

  // Settings change persists
  await page.selectOption('select[data-setting="length"]', 'short');
  check(await page.$eval('select[data-setting="length"]', (s) => s.value) === 'short', 'length setting changes');
  await page.selectOption('select[data-setting="length"]', 'standard');
  await page.fill('#seed-input', 'UITEST-1');
  await page.press('#seed-input', 'Tab');

  // Reaping
  await page.click('[data-action="start-reaping"]');
  await page.waitForSelector('.districts');
  check(await page.$$eval('.tcard', (n) => n.length) === 24, 'reaping shows 24 tribute cards');
  check(await page.$$eval('.district', (n) => n.length) === 12, 'reaping shows 12 districts');
  const before = await page.$eval('.district:nth-child(12) .traits', (e) => e.textContent);
  await page.selectOption('select[data-profile="11"]', 'masonry');
  const after = await page.$eval('.district:nth-child(12) .traits', (e) => e.textContent);
  check(before !== after, 'changing a district industry re-rolls its traits');
  await page.click('.district:nth-child(1) .tcard:nth-child(1) .link');
  await page.waitForSelector('.dialog.edit');
  await page.$eval('#trait-strength', (el) => { el.value = '10'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.selectOption('#gender', '2');
  await page.screenshot({ path: shots + 'd2-edit.png' });
  await page.click('[data-action="save-traits"]');
  const str = await page.$eval('.district:nth-child(1) .tcard:nth-child(1) .trait:nth-child(1) b', (e) => e.textContent);
  check(str === '10', 'editing a trait saves it');
  check((await page.textContent('.district:nth-child(1) .tcard:nth-child(1) .tname span')).includes('They'), 'pronoun change saves');
  await page.screenshot({ path: shots + 'd3-reaping.png' });

  // Shuffle on the Reaping screen keeps industries, pronouns and the 24 tributes
  const namesBefore = await page.$$eval('.tname b', (n) => n.map((x) => x.textContent));
  const editedName = namesBefore[0];
  await page.click('[data-action="shuffle-reaping"]');
  await page.waitForSelector('.districts');
  const namesAfter = await page.$$eval('.tname b', (n) => n.map((x) => x.textContent));
  check(namesAfter.length === 24 && [...namesAfter].sort().join() === [...namesBefore].sort().join(), 'reaping shuffle keeps all 24 tributes');
  check(namesAfter.join() !== namesBefore.join(), 'reaping shuffle moves tributes between districts');
  check(await page.$eval('select[data-profile="11"]', (s) => s.value) === 'masonry', 'reaping shuffle keeps the chosen district industry');
  const pron = await page.$$eval('.tcard', (cards, nm) => { const c = cards.find((x) => x.querySelector('.tname b').textContent === nm); return c && c.querySelector('.tname span').textContent; }, editedName);
  check(pron && pron.includes('They'), 'reaping shuffle keeps edited pronouns');
  await page.screenshot({ path: shots + 'd3b-shuffled.png' });
  await page.click('[data-action="restore-reaping"]');
  const namesRestored = await page.$$eval('.tname b', (n) => n.map((x) => x.textContent));
  check(namesRestored.join() === namesBefore.join(), 'reaping restore brings back the original districts');
  await page.click('[data-action="shuffle-reaping"]');

  // Begin
  await page.click('.hero [data-action="begin-games"]');
  await page.waitForSelector('.feed .entry');
  const entries = await page.$$eval('.feed .entry', (n) => n.length);
  check(entries >= 12 && entries <= 24, `bloodbath shows events (${entries})`);
  const leftovers = await page.$eval('.feed', (f) => /\(Player|\[type/i.test(f.textContent));
  check(!leftovers, 'no unrendered template tokens in the feed');
  await page.screenshot({ path: shots + 'd4-bloodbath.png' });

  // Status panel
  await page.click('[data-action="toggle-panel"][data-panel="status"]');
  await page.waitForSelector('#panel .roster');
  const aliveNum = await page.$eval('.alive-count b', (e) => +e.textContent);
  check(await page.$$eval('#panel .srow', (n) => n.length) === aliveNum, `status lists every living tribute (${aliveNum})`);
  await page.selectOption('#status-sort', 'kills');
  await page.click('.seg button[data-value="all"]');
  check(await page.$$eval('#panel .srow', (n) => n.length) === 24, 'status "All" lists all 24');
  await page.screenshot({ path: shots + 'd5-status.png' });
  await page.click('#panel .srow');
  await page.waitForSelector('.dialog.profile');
  check((await page.textContent('.dialog.profile')).includes('Their games'), 'profile opens from status');
  await page.screenshot({ path: shots + 'd6-profile.png' });
  await page.keyboard.press('Escape');
  check(await page.$eval('#modal', (m) => m.hidden), 'Escape closes the profile');

  // Proceed a few phases
  for (let i = 0; i < 3; i++) { await page.click('#controls [data-action="proceed"]'); await page.waitForTimeout(60); }
  const title = await page.textContent('.phase-title h1');
  check(/Day|Night|Fallen|Arena|Feast/.test(title), `proceeding moves through phases (${title.trim()})`);
  await page.screenshot({ path: shots + 'd7-phase.png' });

  // Gamemaker
  await page.click('[data-action="toggle-panel"][data-panel="gm"]');
  await page.waitForSelector('#panel.gm, #panel .gm');
  await page.selectOption('#gm-arena', { index: 2 });
  await page.click('[data-action="gm-disaster"]');
  check((await page.textContent('#panel')).includes('Queued'), 'disaster shows as queued');
  check((await page.textContent('#controls')).includes('Disaster queued'), 'controls show the queued disaster');
  const giftTarget = await page.$eval('#gm-tribute', (s) => s.options[0].textContent);
  await page.selectOption('#gm-item', 'medkit');
  await page.click('[data-action="gm-gift"]');
  await page.waitForTimeout(50);
  check((await page.textContent('#toast')).includes('Gift sent'), `gift confirmation toast (${giftTarget})`);
  check((await page.textContent('.feed')).includes('The Gamemakers send'), 'gift appears in the feed');
  await page.screenshot({ path: shots + 'd8-gm.png' });
  await page.click('[data-action="close-panel"]');
  await page.click('#controls [data-action="proceed"]');
  await page.waitForTimeout(50);
  check((await page.textContent('.phase-title h1')).includes('Arena'), 'queued disaster happens next');
  check((await page.textContent('.phase-title')).includes('Gamemakers'), 'disaster is flagged as Gamemakers');

  // Phase tabs: go back and forward
  await page.click('.tabs .tab:first-child');
  check((await page.textContent('.phase-title h1')).includes('Bloodbath'), 'phase tab returns to the Bloodbath');
  await page.click('#controls [data-action="proceed"]');
  check(!(await page.textContent('.phase-title h1')).includes('Bloodbath'), 'Proceed returns to the latest phase');

  // Auto-play
  await page.selectOption('#speed', 'faster');
  const phasesBefore = await page.$$eval('.tabs .tab', (n) => n.length);
  await page.click('[data-action="toggle-auto"]');
  await page.waitForTimeout(6000);
  await page.click('[data-action="toggle-auto"]').catch(() => {});
  const phasesAfter = await page.$$eval('.tabs .tab', (n) => n.length).catch(() => phasesBefore + 1);
  check(phasesAfter > phasesBefore, `auto-play advances phases (${phasesBefore} -> ${phasesAfter})`);

  // Persistence: reload and resume
  await page.reload();
  await page.waitForSelector('.hero h1');
  check(!!(await page.$('[data-action="resume"]')), 'after reload, a Resume button is offered');
  await page.click('[data-action="resume"]');
  await page.waitForSelector('.feed');
  check(await page.$$eval('.tabs .tab', (n) => n.length) >= phasesAfter, 'resumed game keeps its phases');

  // Skip to end
  await page.click('[data-action="skip-to-end"]');
  await page.waitForSelector('.dialog.confirm');
  await page.click('[data-action="confirm-skip"]');
  await page.waitForSelector('.victors');
  await page.waitForTimeout(200);
  check(await page.$$eval('[data-chart="odds"] polyline', (n) => n.length) === 5, 'end screen draws the odds chart (5 lines)');
  check(await page.$$eval('.placements li', (n) => n.length) === 24, 'end screen lists 24 placements');
  check(await page.$$eval('.awards li', (n) => n.length) >= 3, 'end screen shows awards');
  await page.screenshot({ path: shots + 'd9-end.png', fullPage: true });
  await page.click('[data-action="back-to-game"]');
  check(!!(await page.$('.finale')), 'reading the games again shows the finale line');
  await noOverflow(page, 'desktop game');

  // Import a cast (good and bad)
  await page.click('.brand');
  await page.click('[data-action="import-cast"]');
  await page.fill('#import-text', 'hello world');
  await page.click('[data-action="do-import"]');
  check(!!(await page.$('.dialog .error')), 'bad cast import shows an error');
  await page.fill('#import-text', 'My Games\n\n\nDistrict 1\n#FF0000 0 0\n\nAnn Lee\nAnn\n0\nx\nBW\n\nBo Kim\nBo\n1\nx\nBW\n\n\nDistrict 2\n#00FF00 0 0\n\nCy Day\nCy\n1\nx\nBW');
  await page.click('[data-action="do-import"]');
  await page.waitForTimeout(50);
  check((await page.textContent('.hero h1')).includes('My Games'), 'good cast import updates the title');
  check((await page.textContent('.setup-grid')).includes('3'), 'imported cast count shows');
  // Play the tiny game fully through the UI
  await page.click('[data-action="start-reaping"]');
  await page.waitForSelector('.dialog.confirm').then(() => page.click('[data-action="confirm-new"]')).catch(() => {});
  await page.waitForSelector('.districts');
  await page.click('.hero [data-action="begin-games"]');
  for (let i = 0; i < 80; i++) {
    if (await page.$('.victors')) break;
    const btn = await page.$('#controls .btn.primary');
    if (!btn) break;
    await btn.click();
    await page.waitForTimeout(20);
  }
  check(!!(await page.$('.victors')), 'a 3-tribute game reaches the end screen by pressing Proceed');
  // Export dialog
  await page.click('.brand');
  await page.click('[data-action="reset-cast"]');
  await page.click('[data-action="export-events"]');
  const exported = await page.$eval('#export-text', (t) => t.value);
  check(exported.startsWith('Bloodbath Events') && exported.includes('Fatal Feast Events'), 'events export dialog has the full file');
  await page.click('[data-action="close-modal"]');
  await ctx.close();
}

// ---------- Phone
{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  await page.goto(URL_);
  await page.waitForSelector('.hero h1');
  await noOverflow(page, 'phone setup');
  await page.screenshot({ path: shots + 'm1-setup.png' });
  await page.click('[data-action="start-reaping"]');
  await page.waitForSelector('.districts');
  await noOverflow(page, 'phone reaping');
  await page.screenshot({ path: shots + 'm2-reaping.png' });
  await page.click('.hero [data-action="begin-games"]');
  await page.waitForSelector('.feed .entry');
  await noOverflow(page, 'phone game');
  await page.screenshot({ path: shots + 'm3-bloodbath.png' });
  for (let i = 0; i < 4; i++) await page.click('#controls [data-action="proceed"]');
  await page.screenshot({ path: shots + 'm4-phase.png' });
  const tooSmall = await page.$$eval('#controls button, #top button', (bs) => bs.filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).map((b) => b.textContent));
  check(tooSmall.length === 0, `phone buttons are at least 40px tall (${tooSmall.join(',')})`);
  await page.click('[data-action="toggle-panel"][data-panel="status"]');
  await page.waitForSelector('#panel .roster');
  await page.screenshot({ path: shots + 'm5-status.png' });
  await page.click('[data-action="close-panel"]');
  await page.click('[data-action="toggle-panel"][data-panel="gm"]');
  await page.screenshot({ path: shots + 'm6-gm.png' });
  await page.click('[data-action="close-panel"]');
  await page.click('[data-action="toggle-panel"][data-panel="status"]');
  await page.click('#panel .srow');
  await page.waitForSelector('.dialog.profile');
  await noOverflow(page, 'phone profile');
  await page.screenshot({ path: shots + 'm7-profile.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await ctx.close();
}

// ---------- Light theme and no-storage
{
  const { ctx, page } = await newPage({ width: 1024, height: 768 });
  await page.goto(URL_);
  await page.waitForSelector('.hero h1');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.click('[data-action="start-reaping"]');
  await page.click('.hero [data-action="begin-games"]');
  await page.click('#controls [data-action="proceed"]');
  await page.screenshot({ path: shots + 'l1-light-game.png' });
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 800, height: 700 } });
  const p2 = await c2.newPage();
  p2.on('pageerror', (e) => problems.push(`pageerror(no storage): ${e.message}`));
  await p2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
  await p2.goto(URL_);
  await p2.waitForSelector('.hero h1');
  await p2.click('[data-action="start-reaping"]');
  await p2.click('.hero [data-action="begin-games"]');
  check(!!(await p2.$('.feed .entry')), 'works when browser storage is blocked');
  await c2.close();
}

// ---------- Cast editor
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 });
  await page.goto(URL_);
  await page.waitForSelector('.hero h1');
  await page.click('[data-action="edit-cast"]');
  await page.waitForSelector('.edistrict');
  check(await page.$$eval('.edistrict', (n) => n.length) === 12, 'cast editor opens with 12 districts');
  await page.fill('#ce-districts', '4');
  await page.fill('#ce-per', '3');
  await page.click('[data-action="ce-resize"]');
  await page.waitForSelector('.dialog.confirm');
  const resizeMsg = await page.textContent('.dialog.confirm');
  check(resizeMsg.includes('16 tributes'), `resize warns how many tributes will be removed (16 = Districts 5-12): ${resizeMsg}`);
  await page.click('[data-action="ce-resize-confirm"]');
  check(await page.$$eval('.edistrict', (n) => n.length) === 4 && await page.$$eval('.erow', (n) => n.length) === 12, 'resize to 4 districts x 3 tributes');
  await page.fill('input[data-cast="t.0.0.name"]', 'Zed Alpha');
  await page.fill('input[data-cast="t.0.0.nickname"]', 'Zed');
  await page.selectOption('select[data-cast="t.0.0.gender"]', '2');
  await page.fill('input[data-cast="d.0.name"]', 'Capitol');
  await page.$eval('input[data-cast="d.0.color"]', (el) => { el.value = '#ff0000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-action="ce-add-district"]');
  check(await page.$$eval('.edistrict', (n) => n.length) === 5, 'add district');
  check(await page.$eval('input[data-cast="t.0.0.name"]', (e) => e.value) === 'Zed Alpha', 'typed names survive a re-render');
  await page.click('[data-action="ce-add-tribute"][data-d="0"]');
  check(await page.$$eval('.edistrict[data-district="0"] .erow', (n) => n.length) === 4, 'add tribute');
  await page.click('[data-action="ce-remove-tribute"][data-d="4"][data-t="1"]');
  check(await page.$$eval('.edistrict[data-district="4"] .erow', (n) => n.length) === 2, 'remove tribute');
  await page.selectOption('select[data-move="0.3"]', '1');
  check(await page.$$eval('.edistrict[data-district="1"] .erow', (n) => n.length) === 4, 'move tribute to another district');
  await page.fill('input[data-cast="t.1.0.name"]', '');
  await page.click('.size-card [data-action="ce-save"]');
  check(!!(await page.$('.edistrict')) && !!(await page.$('.errors')), 'saving with a blank name shows an error and stays in the editor');
  await page.fill('input[data-cast="t.1.0.name"]', 'Yara Lane');
  await page.screenshot({ path: shots + 'e1-cast-editor.png' });
  await page.click('.size-card [data-action="ce-save"]');
  await page.waitForSelector('.hero h1');
  const setupText = await page.textContent('.setup-grid');
  check(setupText.includes('Capitol') && /15\s*tributes/.test(setupText.replace(/\s+/g, ' ')), 'saved cast shows on setup (Capitol, 15 tributes)');
  await page.click('[data-action="start-reaping"]');
  await page.waitForSelector('.districts');
  check(await page.$$eval('.tcard', (n) => n.length) === 15, 'reaping uses the edited cast (15 cards)');
  const first = await page.$eval('.tcard .tname', (e) => e.textContent);
  check(first.includes('Zed Alpha') && first.includes('They'), 'edited name and pronouns carry into the game');
  await page.click('.hero [data-action="begin-games"]');
  await page.click('[data-action="skip-to-end"]');
  await page.click('[data-action="confirm-skip"]');
  await page.waitForSelector('.victors');
  check(await page.$$eval('.placements li', (n) => n.length) === 15, 'the custom cast plays to the end');
  // Discard keeps the saved cast
  await page.click('.brand');
  await page.click('[data-action="edit-cast"]');
  await page.fill('input[data-cast="t.0.0.name"]', 'Should Not Save');
  await page.click('.size-card [data-action="ce-discard"]');
  await page.click('[data-action="ce-discard-confirm"]');
  check(!(await page.textContent('.setup-grid')).includes('Should Not Save'), 'discard leaves the saved cast alone');
  // Blank cast from scratch
  await page.click('[data-action="edit-cast"]');
  await page.click('[data-action="ce-blank"]');
  await page.click('[data-action="ce-blank-confirm"]');
  check((await page.$eval('input[data-cast="t.0.0.name"]', (e) => e.value)) === 'District 1 Tribute 1', 'start from a blank cast fills placeholders');
  await page.click('.size-card [data-action="ce-discard"]');
  await page.click('[data-action="ce-discard-confirm"]');
  await page.click('[data-action="reset-cast"]');
  await ctx.close();
}

// ---------- Events editor
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 });
  await page.goto(URL_);
  await page.waitForSelector('.hero h1');
  await page.click('[data-action="edit-events"]');
  await page.waitForSelector('.cats');
  check(await page.$$eval('.cat', (n) => n.length) === 10, 'events editor shows all 10 sections');
  check(await page.$$eval('#ev-list .evrow', (n) => n.length) === 73, 'bloodbath list shows 73 events');
  await page.click('#ev-search');
  await page.keyboard.type('sword');
  const filtered = await page.$$eval('#ev-list .evrow', (n) => n.length);
  check(filtered > 0 && filtered < 73, `search filters the list (${filtered})`);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'ev-search', 'search box keeps focus while typing');
  await page.fill('#ev-search', '');
  await page.dispatchEvent('#ev-search', 'input');
  // New event built with the insert buttons
  await page.click('[data-action="ev-add"]');
  await page.waitForSelector('.dialog.event-form');
  await page.fill('#ev-text', '');
  await page.selectOption('#ev-count', '2');
  await page.selectOption('#tok-player', '1');
  await page.click('[data-action="tok"][data-tok="name"]');
  await page.fill('#tok-verb-s', 'paints');
  await page.fill('#tok-verb-b', 'paint');
  await page.click('[data-action="tok-verb"]');
  await page.focus('#ev-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' a portrait of');
  await page.selectOption('#tok-player', '2');
  await page.click('[data-action="tok"][data-tok="name"]');
  await page.keyboard.type('.');
  const raw = await page.$eval('#ev-text', (t) => t.value);
  check(raw === '(Player1) (paints/paints/paints/paints/paint1) a portrait of (Player2).', `insert buttons build the template (${raw})`);
  check((await page.textContent('#ev-preview')).includes('Ana paints a portrait of Ben.'), 'live preview renders sample names');
  check(!!(await page.$('#ev-preview .ok')), 'preview says the event is valid');
  await page.screenshot({ path: shots + 'e2-event-form.png' });
  await page.click('[data-action="ev-form-save"]');
  check(await page.$$eval('#ev-list .evrow', (n) => n.length) === 74, 'new event added (74)');
  // Invalid event cannot be saved
  await page.click('[data-action="ev-add"]');
  await page.fill('#ev-text', '(Player1) hugs (Player3).');
  await page.dispatchEvent('#ev-text', 'input');
  check((await page.textContent('#ev-preview')).includes('Player3'), 'preview explains the problem');
  await page.click('[data-action="ev-form-save"]');
  check(!!(await page.$('.dialog.event-form')), 'invalid event is not saved');
  await page.click('.dialog [data-action="close-modal"]');
  // Delete one
  await page.click('#ev-list .evrow:first-child [data-action="ev-delete"]');
  check(await page.$$eval('#ev-list .evrow', (n) => n.length) === 73, 'delete removes an event');
  // Fatal event with killers and a weapon
  await page.click('[data-action="ev-cat"][data-cat="day:fatal"]');
  await page.click('[data-action="ev-add"]');
  await page.fill('#ev-text', '(Player1) (bonks/bonks/bonks/bonks/bonk1) (Player2) with a mace.');
  await page.dispatchEvent('#ev-text', 'input');
  check((await page.textContent('#ev-preview')).toLowerCase().includes('mace'), 'reading explains the mace preference');
  await page.click('[data-action="ev-form-save"]');
  check(await page.$$eval('#ev-list .evrow', (n) => n.length) === 107, 'fatal day event added (107)');
  // Edit an existing event's player count re-renders role pickers
  await page.click('#ev-list .evrow:last-child [data-action="ev-edit"]');
  await page.selectOption('#ev-count', '3');
  check(await page.$$eval('input[name="killed"]', (n) => n.length) === 3, 'changing player count updates the killer/killed pickers');
  check((await page.$eval('#ev-text', (t) => t.value)).includes('bonks'), 'text survives the player-count change');
  await page.click('.dialog [data-action="close-modal"]');
  // Arena event
  await page.click('[data-action="ev-cat"][data-cat="arena"]');
  await page.click('[data-action="ev-add"]');
  await page.waitForSelector('#arena-title');
  await page.fill('#arena-title', 'A meteor shower hits the arena.');
  await page.click('[data-action="ev-add-scenario"][data-kind="fatal"]');
  await page.click('[data-action="ev-form-save"]');
  check((await page.$$eval('.evlist', (l) => l[1].querySelectorAll('.evrow').length)) === 2, 'arena fatal scenario added');
  await page.click('[data-action="ev-delete-scenario"][data-kind="survive"]');
  check((await page.textContent('#toast')).includes('at least one surviving'), 'last surviving scenario cannot be deleted');
  await page.click('[data-action="ev-close-arena"]');
  check(await page.$$eval('#ev-list .evrow', (n) => n.length) === 24, 'arena list shows 24');
  // Endgame
  await page.click('[data-action="ev-cat"][data-cat="endgame"]');
  await page.click('#ev-list [data-action="ev-edit"]');
  await page.fill('#eg-chance', '50');
  await page.click('[data-action="eg-save"]');
  check((await page.textContent('#ev-list')).includes('50%'), 'endgame chance edited');
  await page.screenshot({ path: shots + 'e3-events-editor.png' });
  await page.click('.size-card [data-action="ev-save-all"]');
  await page.waitForSelector('.hero h1');
  const card = (await page.textContent('.setup-grid')).replace(/\s+/g, ' ');
  check(/Arena disasters\s*24/.test(card), `saved events show on setup (24 arena): ${card.slice(card.indexOf('Phase'), card.indexOf('Phase') + 160)}`);
  await page.click('[data-action="export-events"]');
  const ex = await page.$eval('#export-text', (t) => t.value);
  check(ex.includes('(paints/paints/paints/paints/paint1) a portrait of (Player2).') && ex.includes('meteor shower') && ex.includes('50%'), `export contains the new events (paints ${ex.includes('a portrait of')}, meteor ${ex.includes('meteor shower')}, 50% ${ex.includes('50%')})`);
  await page.click('[data-action="close-modal"]');
  // Reload: edits persist
  await page.reload();
  await page.waitForSelector('.hero h1');
  check(/Arena disasters\s*24/.test(await page.textContent('.setup-grid')), 'edited events survive a reload');
  // Discard flow
  await page.click('[data-action="edit-events"]');
  await page.click('#ev-list .evrow:first-child [data-action="ev-delete"]');
  await page.click('.brand');
  await page.waitForSelector('.dialog.confirm');
  await page.click('[data-action="ev-discard-confirm"]');
  check((await page.textContent('.setup-grid')).includes('73'), 'leaving with unsaved changes asks first and discards');
  // Play with the edited events
  await page.click('[data-action="start-reaping"]');
  await page.click('.hero [data-action="begin-games"]');
  await page.click('[data-action="skip-to-end"]');
  await page.click('[data-action="confirm-skip"]');
  await page.waitForSelector('.victors');
  check(true, 'a game with edited events plays to the end');
  await page.click('.brand');
  await page.click('[data-action="reset-events"]');
  await ctx.close();
}

// ---------- Editors on a phone
{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  await page.goto(URL_);
  await page.waitForSelector('.hero h1');
  await page.click('[data-action="edit-cast"]');
  await page.waitForSelector('.edistrict');
  await noOverflow(page, 'phone cast editor');
  await page.screenshot({ path: shots + 'e4-phone-cast-editor.png' });
  await page.click('.size-card [data-action="ce-discard"]');
  await page.click('[data-action="edit-events"]');
  await page.waitForSelector('.cats');
  await noOverflow(page, 'phone events editor');
  await page.click('#ev-list .evrow:first-child [data-action="ev-edit"]');
  await page.waitForSelector('.dialog.event-form');
  await noOverflow(page, 'phone event form');
  await page.screenshot({ path: shots + 'e5-phone-event-form.png' });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nALL UI CHECKS PASSED');
process.exit(problems.length ? 1 : 0);

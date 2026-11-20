# Hunger Games Simulator

A BrantSteele-style Hunger Games simulator where tributes have stats, items, injuries,
alliances and popularity, and everything they do changes their odds of winning.

## Play

Play in your browser: **https://mcnecho.github.io/hunger-games-simulator/**
(a single-file copy for offline play is at `/hunger-games-simulator.html` on the same site).

## Using it

Run `npm install && npm run build`, then open `dist/single.html` in a browser
(or host `dist/index.html`, `app.js` and `app.css` together). Cast and event files in
BrantSteele's format import and export as-is.

The default cast is the 24 tributes of the 74th Hunger Games, with names from the books,
films and the Hunger Games wiki (Marvel, Glimmer, Cato, Clove, Foxface, Jason, Thresh, Rue,
Peeta Mellark, Katniss Everdeen; the rest are unnamed in canon, e.g. "District 3 Male").
Import or build your own cast from the Setup screen.

Features: district-based traits and training scores, items, health, hunger and thirst,
injuries and infection, alliances and betrayals, sponsors and popularity, mental strain,
arena disasters, the Feast, calibrated win odds, a separate Status panel, Gamemaker mode
(disasters, feasts, gifts), shuffling districts, a cast editor and an events editor,
auto-play with speed control, and phone-friendly layouts.

## Project layout

```
src/core/       rng.js (seeded, replayable randomness), grammar.js (BrantSteele template rendering)
src/io/         castFormat.js, eventsFormat.js: BrantSteele import/export
src/data/       districts.js (industries -> traits), items.js, builtinEvents.js, defaultData.js (generated)
src/engine/     the simulation, no browser code:
  tagger.js     reads each event's wording -> requirements, preferences and effects
  dsl.js        optional "Requires:" / "Effects:" lines under events
  tributes.js   tribute creation and derived scores (combat, vulnerability, needs)
  casting.js    picks events and who plays each role, weighted by stats, items and alliances
  effects.js    applies outcomes: deaths, loot, items, injuries, bonds, popularity
  alliances.js  bonds and alliances (form, break, betrayal, late-game strain)
  pacing.js     death targets so games last the chosen number of days
  odds.js       win odds (weights fitted on simulated games with tools/fit-odds.mjs)
  phases.js     Bloodbath, Day, Night, Feast, Arena, Fallen, end-of-night upkeep, Endgame
  game.js       the Game class: phase order, Gamemaker actions, save/load
src/ui/         interface (plain JS views returning HTML strings, one controller in app.js)
  editors.js    pure logic for the cast and events editors (resize, add/remove, validation, previews)
  editorActions.js  editor buttons and inputs, given a small context by app.js
test/           node --test suites, including thousands of simulated games checked for rule violations
test-ui/        headless-browser run-through of every screen at desktop and phone sizes
tools/          build, data generation, odds fitting, statistics
```

## Hosting

`.github/workflows/pages.yml` runs the tests, builds the game and publishes it to GitHub Pages
on every push to `main`. One-time setup: Settings → Pages → Source: **GitHub Actions**.

## Commands

```
npm install          # installs esbuild (only dependency)
npm test             # engine + import tests (about a minute)
npm run build        # writes dist/
node tools/stats.mjs 300      # game length, alliances, kills, unused events
node tools/calibrate.mjs 500  # are the odds honest?
node tools/dump-tags.mjs day  # how the tagger reads each Day event
```

To change the default cast or events, replace `data/cast.txt` / `data/events.txt` and run `npm run build`.

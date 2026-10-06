# Bunker Pilot — Setup Guide REVISION: build plan (resume here)

The v1.79 guide was reported incomplete ("plenty of entries were missed"). The audit is in `AUDIT-SETUP-GUIDE.md` (tick list per tab).
The revision is delivered in chunks (chunk 4 was split into 4a and 4b) so no single reply reaches the limit. After each chunk: run `npm test`, run
`node build-prototype.mjs <previous-prototype.html> <new-prototype.html>` (patches the single-file prototype from these sources),
verify in headless Chromium, then deliver the zip and ask the user whether to continue.

| Chunk | Version | Content | Status |
|---|---|---|---|
| 1 | v1.80 | Engine: cursor auto-focus, arrow pointer, draggable card, popup auto-minimize, "add more tanks?" question, audit list, builder script | DONE |
| 2 | v1.81 | Setup + Ports missed entries; Ports links | DONE |
| 3 | v1.82 | Tanks: max-fill popup, add-tank popup fields, per-tank fields, water, save condition | DONE |
| 4a | v1.83 | Bunkering (fuel type, sulphur, drums, auto-allocate, lube, conditions, delete entry) + the Fuel additives panel | DONE |
| 4b | v1.84 | ECA/SECA missed entries (method, fuels, systems, service system quantity, leaving, result) | DONE |
| 5 | v1.85 | Home popups, Results, "save before you finish" gate, final README + tests | DONE (this zip) — THE REVISION IS COMPLETE |

## The revision is complete (v1.85)
Nothing is left from `AUDIT-SETUP-GUIDE.md`. Possible follow-ups (not requested): a browser check of the `home-eco` step with an ECA/SECA port ticked; making the tank-condition save a hard requirement of the final step (today it is the person's confirmation, and the question says when no tank condition is saved).

## What v1.85 added (reference)
- Engine (`guide.js`): `step.ask.gate = true` makes the question a confirmation. The Yes button confirms (Next unlocks); the No button (\"Not yet\") shows `ask.yesHint` and hides itself; the question returns when `count()` changes. Ordinary asks are unchanged.
- Home (`dashboard`, 22 steps): `home-route` (the only required one), `home-bunker`, `home-plan`, then the popup steps `pb-port`, `pb-other`, `pb-until`, `pb-margin`, `pb-fill`, `pb-compare`, `pb-results`, `pb-apply`, `pb-export`, `pb-forms`; `home-rob`, `rv-mode`, `rv-port`, `rv-date`, `rv-goto`; `home-eco` (only with an ECA/SECA port), `home-search`, `home-alerts`, `home-calc`.
- Results (9 steps): `res-rob`, `res-docx`, `res-bunkerform`, `res-lubeform`, `res-name`, `res-save` (required), `res-list`, `res-plan`, `res-final` (required, gate: save tank condition + save voyage, then confirm).
- Helpers/exports in `guide-steps.js`: `PB_OTHER_ORDER`, `PB_FORM_ORDER`, `finalSaveQuestion`; internal `pbSel`, `rvSel`, `visibleEl`.
- Popup steps point at the opening button while the popup is closed and at the box once it is open. The `.pb-other` boxes only appear after \"Other port / date\u2026\"; the form tick-boxes only after Export.
- Load demo / Clear all / New plan: `#demoPlan` is shown only on tablet/desktop, so `res-plan` points at `#demoPlan2` on a phone.
- No change to calculations. Complete saved plans are still marked done silently.

## What v1.84 added (reference)
- ECA/SECA steps (all optional except `eca-dist`, `eca-from`, `eca-to`, unchanged): `eca-port`, `eca-prev`, `eca-dist`, `eca-method`, `eca-fromfuel`, `eca-tofuel`, `eca-from`, `eca-to`, `eca-limit`, `eca-sys-on`, `eca-rate`, `eca-qtyunit`, `eca-qty`, `eca-result`, `eca-exit`, `eca-leave-from`, `eca-leave-to`, `eca-leave-limit`, `eca-leave-result`.
- Helpers in `guide-steps.js`: `sf(i, dir, sys, field)`, `mp(i, dir, field)`, `sysPick(c, test)`, `entI`, `lvI`, `lvCfg`, `leaveFixed(c)` (same rule as `ecoLeaveFixed`), `opt(...)`.
- No engine change.

## What v1.83 added (reference)
- Bunkering steps (all optional except `bk-alloc`, unchanged): `bk-ports`, `bk-fueltype`, `bk-sulphur`, `bk-qty`, `bk-proposed`, `bk-auto`, `bk-entry`, `bk-alloc`, `bk-mode`, `bk-drums`, `bk-lube-cyl`, `bk-lube-mesys`, `bk-lube-gesys`, `bk-addline`, `bk-cond`, `bk-delete`, then the Fuel additives box: `bk-ad-add`, `bk-ad-name`, `bk-ad-treats`, `bk-ad-rob`, `bk-ad-dose`, `bk-ad-remove`.
- Helpers in `guide-steps.js`: `additives(s)`, `bkAt(i, g, f)`, `bkWhere(s, pred, g0)` (port + product a step points at: the first planned bunker that fits, else the first bunker port), `fuelWhere(s)`, `lubeWhere(s, g)`, `lubeAny(s)`, `adBad(s, f)` / `adSel(f)` (the first additive still missing that value), `lubeBunkerStep(g, label)`.
- No engine change. Required gating is unchanged, so complete plans are still marked done silently.

## What v1.82 added (reference)
- Engine (`guide.js`): `sel` is now called as `sel(state, touched)`. `touched` is the Set of ids of the fields of the OPEN popup the person has finished (`focusout` / `change` inside the popup); it is cleared when a popup opens or closes. `focusTarget` no longer steals the cursor from another box of the popup the person is already typing in.
- Helpers in `guide-steps.js`: `popupField(order, touched, isShown)`, `ADD_TANK_ORDER`, `hasWaterTank(s)`, `modalShown(id)`, `fieldShown(id)`, `fuelTankSteps(g)`, `anyTank(s)`.
- Tanks (new steps, all optional or conditional): `maxfill` (first step), `noon-now`, `noon-offset`, `noon-mesys`, `noon-gesys`, `noon-fw`, `noon-dw` (`noon-lube` is now cylinder oil only); for fuel oil and diesel oil `*-fueltype`, `*-sulphur`, `*-robas`, `*-temp` (volume entry only), `*-density` (volume tanks only); one-time `tank-role`, `tank-name`, `tank-consume`, `tank-additive`, `tank-order`, `tank-remove`; `water-add-fw`, `water-add-dw`, `water-name`, `water-cap`, `water-rob`, `water-fw-rate`, `water-dw-rate`, `water-fwg`, `water-fwg-tank`, `water-draw`; `save-date`, `save-now`, `save-zone-mode`, `save-zone`. The add-tank step (`*-tank`) now walks the popup. The ROB step highlights both the ROB box and the corrected-volume box.
- Nothing new blocks Next: required steps are unchanged, so complete existing plans are still marked done silently (verified with the demo plan).

## What v1.81 added (reference)
- Setup: `voyage-no`, `rate-names`, `fo-same` (when mode = both), `rates-locked`, `fo-anchor`, `do-port`, `do-anchor` (when a diesel rate exists), `cyl-name`, `mesys-reserve`, `gesys-reserve` (when that make-up rate > 0).
- Ports: `p1-eta`, `p1-distance`, `p1-speed`, `p1-stay`, `p1-utc`, `p2-anchor-days`, `p2-anchor-hours`, `p2-stay-hours`, `fo-leg` (mode = both), `legs-stay`, `p-override`, `p-bunker-link`, `p-eca-link`, `p-move`, `p-remove`.
- Helpers in `guide-steps.js`: `lubeUsed(id)`, `card(i)` (`[data-route-card="i"]`), `lastCard(s)` (second port if there is one), `laterStay(s)`.
- Link steps: `sel` = the `.cross-tab-links` span; tapping it switches tab (the other tab's guide takes over; coming back to Ports resumes the same step). No engine change was needed.

## What v1.80 added to the engine (reference)
- `step.ask = { count(state), min?, question(state,n), yesLabel?, noLabel?, yesHint? }` — Yes/No question; Next stays locked until answered; the answer is stored per count in `progress.asks`.
- `arrowPlacement()`, `clampCardPos()` (pure, tested), `askInfo()`, `answerAsk()`.
- UI: `focusTarget()`, `updateArrow()`, card dragging (`bunker-guide-pos-v1`), `syncModal()` (MutationObserver on `hidden` of `.modal`).
- The app itself opens `#maxFillModal` the first time the Tanks tab is shown; the guide folds for it like for any popup.

---- previous notes (v1.79) below ----

# Bunker Pilot — First-time Setup Guide: build plan (resume here)

Chunk 1 (v1.75) DONE: revision history shows the 4 newest versions; Home Tank ROB card is no longer foldable.

Chunk 2 (v1.76) DONE — guide engine:
- `guide.js`: pure state machine (tested in `test-guide.mjs`, 10 tests, part of `npm test`) + `createGuide()` UI (floating card, minimized chip, live re-check on input/change + 600 ms poll).
- `guide-steps.js`: step lists per tab id. Only ONE starter step exists (Setup > vessel name).
- app.js: `guide` instance created right after `state`; `showTab()` calls `guide.onTabShown(id)` when the tab changes; first-launch automatic tour replaced by the guide ("Guide me" button still works); Hints & help modal has "Resume setup guide" / "Restart from the beginning".
- Behaviour: Next is disabled until the step's `check()` passes; Finish re-checks every step of the tab; a tab whose steps all pass already is marked done silently (existing users); progress is saved in localStorage `bunker-guide-v1`; Skip this tab / Skip guide / Minimize / Resume all work. Verified in headless Chromium (phone + desktop) and in the single-file prototype.

Chunk 3 (v1.77) DONE — Setup (13 steps) and Ports (9 steps) in `guide-steps.js`, 10 new tests (20 total in `test-guide.mjs`).
- Engine upgrades: `sel` may be a function of the plan data; folded `<details>` around a target are opened automatically; the highlight is re-applied after the screen re-renders; `optional` steps never block (they show `okMsg`); the card moves to the top (`.sg-top`) when it would cover its target.
- Verified in headless Chromium: a fresh user completes Setup and Ports with real typing; Next stays disabled until each required value is valid; the finished plan has valid data.
- Noon report date/time and Logbook ROB live on the TANKS tab (`#noonLocal`, `#noonRobFo`...) — cover them in chunk 4 together with the tank steps.
- Known: reserve-per-day auto-follows the rate you type, so the reserve steps usually pass at once (intended).

Chunk 4 (v1.78) DONE — Tanks (30 steps, 8 for a fresh fuel-only vessel) and Bunkering (3 steps) in `guide-steps.js`, 10 new tests (30 total in `test-guide.mjs`).
- Tanks: noon report date (optional confirm), logbook ROB for fuel (required), diesel (required when Setup has a diesel rate), lube oils (optional); then per product (fo, do, cyl, mesys, gesys; each only when Setup shows it is used) — add tank, capacity, present ROB, unpumpable (optional), consumption sequence (only with 2+ consumable tanks; duplicates flagged); last step = Save tank condition (optional).
- Rules: only `storage` role tanks count (settling/service are ignored); ROB may stay 0 when the logbook ROB for that product is also 0; capacity is accepted in either `capacity` or `capacityM3`.
- Bunkering: bunkering is optional, so the steps never block on "no bunker planned". `bk-alloc` appears once any bunker quantity exists and blocks only on a manual (auto-allocate off) tank allocation that does not add up to the typed total; per-tank entry and lube drums are exempt. The selector follows the first planned bunker port.
- Exports used by tests: `seqClash`, `badTank`, `bunkerEvents`, `badBunker`.
- Not covered yet: per-tank overfill (needs calculated results), fresh/drinking water and additive sections of the Tanks tab, bunker additives, drum pump-over.

Chunk 5 (v1.79, this zip) DONE — ECA/SECA (6 steps), Home (3 steps) and Results (2 steps) in `guide-steps.js`, 7 new tests (37 total in `test-guide.mjs`). THE SETUP GUIDE IS NOW COMPLETE: every tab has a step list.
- ECA/SECA: `eca-port` (optional; tick ports inside an ECA), then only when a port is entering an ECA: line distance (required, >0), current sulphur and compliant sulphur (required; compliant must not exceed current), required sulphur at inlet (optional, blank = 0.10), and the leaving distance (optional). Entering/leaving ports are derived from the ticked ports (`ecaEntering`, `ecaLeaving`), the same rule as `ecaSyncFromPorts()`. Not covered: fuel types, system rates/quantities and the safety margin.
- Home: route check is required (two complete ports + a fuel tank with a capacity; `planReady`), Bunker needed and Plan a bunkering are explanatory (optional).
- Results: naming is optional; saving is required (`savedVoyageCount()` reads `bunker-saved-voyages-v1`).
- Engine change (guide.js): a tab whose only applicable steps are optional is now STARTED instead of silently marked done (existing users whose required data is complete are still marked done). This is why Bunkering and ECA/SECA show their intro once for a new vessel.
- Known: the ECA/SECA and Bunkering guides need at least one port on the Ports tab (their steps are hidden with no route); an unfinished guide on another tab stays on screen until it is finished, skipped or minimized (engine behaviour from v1.76).

## How to add steps (reference)
Edit `guide-steps.js` only. Each step: `{ id, sel, title, text, need?, check(state, ctx)->true|false|'message', when?(state)->bool }`.
- `sel` = CSS selector of the input to highlight (its `.field` wrapper is outlined). Use ids that exist in index.html / rendered tank & port cards.
- `check` reads `state` (e.g. `state.meta`, `state.fuels`, `state.tanks`, `state.route`) or the DOM through `ctx.q(selector)`. Return a short message saying what is missing.
- `when` hides a step that does not apply (e.g. no ECA port). Keep steps of a tab in the order the user should fill them.
- Fields inside collapsed folds/cards: the guide only highlights visible targets; open the fold in the step (or point `sel` at the visible summary) — decide per step.
- Add tests for each new `check` in `test-guide.mjs`; bump version, revision entry (index.html), sw.js cache; rebuild the prototype (modules are wrapped as `__M['guide']`, `__M['guidesteps']`).

## Remaining chunks for the first-time setup guide

Tabs (data-tab): setup, voyage, tanks, bunkering, eca, dashboard, results.
Existing hooks to reuse/avoid clashing with: the old guided tour (`TOUR_ALL`, `startTour`, localStorage key `bunker-tour-seen`) and the alert guide.
New localStorage keys to use: `bunker-guide-v1` (JSON: per-tab status done/skipped, minimized flag, current step).

### Chunk 2 — Guide engine (DONE in v1.76; list kept for reference)
1. Add `guide.js` (ES module, imported by app.js): step runner with a floating card, highlight on the target field, Next button DISABLED until that field's validator passes.
2. Controls on the card: Minimize (collapses to a small chip), Skip (this tab / whole guide), Resume (chip click or a "Setup guide" button in the menu/About).
3. Per-tab first-open trigger: when a tab is opened for the first time and its guide is not done/skipped, start that tab's steps. Persist progress so closing the app resumes at the same step.
4. Validators are plain functions reading `state` (e.g. value present and > 0). Add `test-guide.mjs` for the engine + validators and add it to `npm test`.
5. Add the stylesheet block, keep clear of the floating pill dock (`--sab`) on phones.

### Chunk 3 — Setup + Voyage (Ports) tab steps (DONE in v1.77)

### Chunk 4 — Tanks + Bunkering tab steps (DONE in v1.78)

### Chunk 5 — ECA/SECA, Home (Dashboard), Results tab steps + final polish (DONE in v1.79)
ECA entry/exit and rates; confirm Home shows a calculated route; saving a voyage under a name. Then: README + revision-history entry, version bump, tests, zip.

Process for each chunk (all chunks done; nothing further is required): deliver the zip, then ask the user whether to continue to the next chunk.

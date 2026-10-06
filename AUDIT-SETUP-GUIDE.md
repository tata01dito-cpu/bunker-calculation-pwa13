# Setup guide audit — entries the v1.79 guide missed (ALL chunks done: v1.80 to v1.85)

Method: every input, select, checkbox, button and popup in `index.html` and in the render functions of `app.js`
(`renderRates`, `routeCard`, `consOverrideHtml`, `tankCard`, `renderStores`, `renderBunkering`, `ecaCard`, the modals) was compared with the
step lists in `guide-steps.js`. The tick list below is what is still MISSING. Each item is assigned to a chunk.
"selector" = what the new step should point at (verify in the browser when writing the step).

## Setup tab  → chunk 2 (v1.81) — DONE
- [x] Voyage / passage no. — `#voyageNo` (optional)
- [x] Rate-card names — `[data-rate-id=X][data-field="name"]` (optional, explain they appear everywhere)
- [x] Fuel oil "VLSFO and HFO have the same consumption rates" — `[data-field="sameAsVlsfo"]` (only when mode = both)
- [x] Diesel oil: in-port/day and at-anchor/drift/day — `[data-rate-id="do"][data-field="portRate"]`, `…="anchorRate"` (today only the sea rate is pointed at)
- [x] Fuel oil anchor/drift rate explanation (it follows the in-port rate unless overridden per port)
- [x] Cylinder oil: name
- [x] ME system oil: reserve days + reserve per day (no reserve step exists; only cyl has one) — use `lubeReserve('mesys')`
- [x] GE system oil: reserve days + reserve per day — use `lubeReserve('gesys')`
- [x] Explain "rates are fixed once entered — changing a set rate asks you to confirm"

## Ports tab (route cards)  → chunk 2 (v1.81) — DONE
- [x] First port ETA (optional) — `[data-route-index=0][data-field="eta"]`
- [x] Port stay (hours) — `[data-field="portStayHours"]` (only days is walked today)
- [x] At anchor / drift (days, hours) — `[data-field="anchorStayDays"]`, `[data-field="anchorStayHours"]`
- [x] First port: distance 0, speed, stay, UTC offset (today only port 2 is walked in detail)
- [x] Every further port: stay + UTC offset (the "legs" step only checks name/distance/speed)
- [x] Fuel oil in use for this leg (VLSFO/HFO) — `[data-field="foActiveFuel"]` (only when Setup mode = both)
- [x] **Override Consumption for this Port** — `details.cons-override summary` (in-port / anchor-drift rate per product; blank = Setup rate)
- [x] **Bunkering & lube oil — see Bunkering tab** — `.cross-tab-links [data-goto-tab="bunkering"]` (explain; offer to jump)
- [x] **ECA/SECA changeover — see ECA/SECA tab** — `.cross-tab-links [data-goto-tab="eca"]` (explain; offer to jump)
- [x] Move earlier / later and Remove port buttons (explain)

## Tanks tab  → chunk 3 (v1.82) — DONE
- [x] Noon report UTC offset — `#noonUtcOffset`; "Today · 12:00 local" button — `#noonLocalNow`
- [x] Logbook ROB: cylinder `#noonRobCyl`, ME system oil `#noonRobMesys`, GE system oil `#noonRobGesys` (the last two only when Setup has a make-up rate), fresh water `#noonRobFw`, drinking water `#noonRobDw` (one step each)
- [x] **Company maximum tank fill popup** (`#maxFillModal`: `#maxFillInput` → `#maxFillSave`) and the "Company maximum tank fill — Change" button (`[data-change-maxfill]`); first step of the tab. `#maxFillSkip` ("Use 85% for now") is explained in the text.
- [x] **Add-tank popup** walked field by field: `#addTankRole`, `#addTankDensity`, `#addTankFuelType`, `#addTankPosition`, `#addTankConfirm` (density / fuel type only for fuel and diesel). `#addTankFuelTypeCustom` ("Other") is covered by the fuel-type step text.
- [x] Per tank: role (`category`), name (`namePreset` / `name`), fuel type (`data-mp="tank"`), sulphur, "Enter ROB as" (`robInput`), corrected volume / ROB, temperature (`robTempC`), density, "Consume automatically" (`consumable`) — one step each; the fuel-type, sulphur, enter-ROB-as, temperature and density steps repeat for fuel oil and diesel oil, the others are explained once on the first tank
- [x] Per tank: additive dosage (`[data-st-dose]`, only when an additive exists), move up/down (`[data-move-order]`, 2+ tanks), Remove (`[data-remove-tank]`)
- [x] Settling / service / support tanks (explained in the Tank role step)
- [x] Fresh & drinking water panel: add tank, name, capacity, ROB, per-day consumption per type, FWG production + "FWG supplies" (2+ fresh tanks), draw order (2+ tanks of a type)
- [x] Fuel additives panel: **it sits on the Bunkering tab (`#additivesPanel`), not on Tanks** → done in part 4a (v1.83), see the Bunkering list below
- [x] Save tank condition: date/time, "Today (local)", "UTC offset" / "Port name" toggle, `#tankSaveOffset` / `#tankSavePort`, then the Save button
- [x] (done in v1.80) "Do you still need to add more tanks of this type?" question after every tank

## Bunkering tab  → chunk 4, part 4a (v1.83) — DONE
- [x] Fuel additives panel `#additivesPanel` (moved here from the Tanks list): `[data-st-addad]`, name, treats, ROB (litres), dosage, `[data-st-delad]`
- [x] Fuel type / grade of the bunker ("Fuel type (this bunker)")
- [x] Bunker sulphur % — `[data-bunker-field="sulphur"]` (needed for ECA / no-mixing)
- [x] "Received as" (tanks vs drums) — `[data-bunker-field="mode"]`; drum pump-over panel (`data-drum-panel`)
- [x] Entry mode: total quantity vs per-tank quantities; Auto-allocate checkbox — `[data-bunker-field="autoAllocate"]`
- [x] Lube oil replenishment (litres) per product
- [x] Bunker additives line, delete-entry button per port, ROB / capacity condition bars

## ECA/SECA tab  → chunk 4, part 4b (v1.84) — DONE
- [x] Change-over method / FOBAS mixing model — `[data-eca-field="method"]`
- [x] Systems: Main Engine / Aux. Engine / Boiler on/off (`[data-eca-field="on"]`) and rates
- [x] Service system quantity and its unit (t / L) — `qtyL`, `qtyUnit`
- [x] Leaving: "Change-over time after leaving" (`leaveMode`) and "Beyond the last port in the plan"
- [x] Fuel types and the safety margin (named as "not covered" in the v1.79 notes)

Note: `leaveMode` is not rendered on screen in v1.84 (dead branch in `ecaLeaveModeHtml`); the safety margin and "Beyond the last port in the plan" are result rows, explained in the result steps.

## Home (Dashboard) popups  → chunk 5 (v1.85) — DONE
- [x] Plan a bunkering popup: `#pbPort`, `#pbName`/`#pbWall`/`#pbOffset`/`#pbStay` (Other port), `#pbUntil`, `#pbMargin`, `#pbFill`, Compare ports, results, `#pbApply`, `#pbExport`, `#pbFormBunker` / `#pbFormLube` / `#pbExportGo`
- [x] ROB viewer popup: `[data-rv-mode]`, `#rvPort`, `#rvDate`, `#rvGoto`
- [x] ECA change-over helper `#ecoBtn`, search `#searchInput`, alerts bell, calculator

## Results tab  → chunk 5 (v1.85) — DONE
- [x] `#exportDocx`, `#exportBunkerForm`, `#exportLubeForm`
- [x] Saved voyages list, ROB comparison card, Load demo / Clear all / New plan
- [x] \"Save before you finish\" gate (`res-final`, `ask.gate`)

## New engine features delivered in v1.80 (this chunk)
1. Cursor lands in the highlighted box (`focusTarget`; once per step; number boxes holding 0 are selected so typing replaces it).
2. Gold arrow pointing at the field (`arrowPlacement`; above, below, or beside the field; follows scroll/resize).
3. Draggable card (drag the header; double-tap the header to dock it again; position kept in `bunker-guide-pos-v1`).
4. Popups: when any `.modal` opens the guide folds into a chip, the arrow/cursor go inside the popup, tapping the chip raises the card above the popup (draggable); closing the popup restores and re-aims.
5. `ask` steps: Yes/No question that blocks Next until answered and comes back when the count changes (used for "add more tanks?" on all five products).

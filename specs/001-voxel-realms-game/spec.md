# Feature Specification: Voxel Realms

**Feature Branch**: `001-voxel-realms-game`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Read and follow VOXEL_REALMS_DETERMINISTIC_PROMPT.md to build the Voxel Realms deterministic voxel sandbox game"

## Clarifications

### Session 2026-10-04

- Q: What should happen if the same world is opened in two game sessions at the same time? → A: Refuse the second open — show "This world is already open in another session" and block play until the first session closes it
- Q: How should the game respond when a save cannot be written because storage is full or unavailable? → A: Warn visibly and repeatedly until a save succeeds; never report a save as successful when the write failed
- Q: On what reference machine should the performance success criteria be measured? → A: A stated minimum specification (an integrated-graphics laptop from the last five years), recorded in the spec
- Q: What characters and length should a world name allow? → A: 1–32 characters, trimmed of surrounding space, any printable characters, unique ignoring case
- Q: Is any accessibility support in scope for this first version? → A: Remappable keys plus colour-independent cues for target selection and health
- Q: When the player opens the inventory and crafting screen, does the simulation pause or does the world keep running? → A: Inventory pauses the simulation — consistent with FR-009 as written, and each inventory open also saves
- Q: When the player closes the browser tab or window, how much unsaved progress is allowed to disappear? → A: Nothing is lost — save additionally whenever the page becomes hidden (tab switch, minimise, close), on top of the 60 s interval and pause
- Q: Should the save record store the live position of every creature in every forest region the player has ever visited? → A: Regenerate creatures from the seed and the restored tick; drop creature state from the save record
- Q: What is the world's height in blocks, and how wide is one region? → A: 16 × 16 wide, 128 tall
- Q: What must the game provide so a first-time player can break and place a block within two minutes without reading any documentation? → A: Require a first-run hint overlay — crosshair plus "hold to break / right-click to place" — that dismisses once the player has broken and placed a block

### Session 2026-10-05

- Q: Given that lighting is specified only as the day-night sky cycle, what should a placed torch and an enclosed cave actually do? → A: Full light model — skylight occluded by terrain plus torch block light with falloff, so caves darken with depth and torches illuminate them (new FR-044)
- Q: What audio must the game actually produce, given that FR-036 demands "all sound effects" without ever listing them and FR-034 promises a music volume control? → A: Enumerated effects plus a procedurally synthesised ambient music loop — the effect set becomes a closed documented list so FR-036 is testable item by item, and the music volume control in FR-034 becomes real (FR-036 amended)
- Q: How does the player close the inventory screen, and what does Escape do while it is open? → A: Escape or E closes the inventory and returns to play; the pause menu is reachable only by pressing Escape again once play has resumed — one press in, one press out, and the two paused screens are never shown together (FR-032 amended)
- Q: What should the shadows and particles settings actually control, given that no requirement anywhere defines a shadow or a particle? → A: Particles become live as visual-only feedback; the shadows control is removed from FR-034 — a shadow map was judged too risky for the SC-003 frame budget on the stated reference machine (FR-034 amended, new FR-045)
- Q: How closely must the player's jump apex match the height predicted by the configured jump velocity and gravity for acceptance scenario 3 to pass? → A: No tolerance — name the integration scheme and constants in Documented Values and assert the exact apex that scheme produces, derived from the documented scheme rather than read back from the implementation (US1 amended)

### Session 2026-10-08

- Q: No task in `tasks.md` boots the game or draws the world — how should that missing integration work enter scope? → A: Add a new FR to this spec, then append the task(s) to `tasks.md` under the chosen source phase with IDs allocated after T132, so no existing Task ID is renumbered (new FR-046)
- Q: Which source phase should deliver the FR-046 composition-root and terrain-draw tasks? → A: Source phase 6 — boot straight into a generated world, and let source phase 13 later insert the main menu in front of the same entry point, so every phase from 6 onward is observable in a browser (tasks T133–T134 appended to source phase 6)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enter and explore a new world (Priority: P1)

A player opens the game, chooses **New World**, optionally types a world seed, and
drops into a first-person view of a freshly generated blocky landscape: hills,
forests, deserts, snowfields, mountains, shorelines and open water. They walk
forward, sprint, jump over a ledge, look around with the mouse, and keep walking
until new terrain appears ahead of them. Nothing blocks their path and the world
does not visibly stutter as they move.

**Why this priority**: Without a world to stand in and a way to move through it,
no other part of the product can be exercised. This slice alone is a playable,
demonstrable minimum viable product.

**Independent Test**: Launch the game, create a new world with a seed, and travel
in one direction for two minutes. Deliverable value: an explorable generated
landscape requiring no further features.

**Acceptance Scenarios**:

1. **Given** the main menu is open, **When** the player selects New World and
   leaves the seed field blank, **Then** a world is generated using the
   documented default seed and the player spawns on solid ground above water.
2. **Given** the player is standing still, **When** they press the forward key,
   **Then** the player moves in the direction the camera faces and stops at
   terrain rather than passing through it.
3. **Given** the player is on the ground, **When** they press jump, **Then**
   the player rises to and lands at exactly the apex the integration scheme in
   Documented Values produces for the documented gravity and jump velocity —
   asserted with **no tolerance**, the expected value derived from that
   documented scheme rather than read back from the implementation.
4. **Given** the player is sprinting toward the edge of loaded terrain, **When**
   they continue forward, **Then** newly needed terrain appears ahead of them
   without the game freezing or the player falling through unfinished ground.
5. **Given** a world generated with seed A, **When** a second world is created
   with seed A in a fresh session, **Then** the terrain, biomes, water, caves,
   ores and trees are identical to the first world, block for block.

---

### User Story 2 - Reshape the terrain (Priority: P2)

The player looks at a block, sees a highlighted outline around it, holds the
break button and watches a progress bar fill until the block pops out of the
world. They then select a different block from their hotbar and place it against
a surface, extending a bridge or wall exactly where they aimed.

**Why this priority**: Breaking and placing blocks is the defining interaction of
a sandbox game. Without it the world is a passive diorama rather than something
the player owns.

**Independent Test**: Generate a world, break five blocks in a wall, and place
five blocks to seal the resulting hole. Deliverable value: the player can alter
the landscape deliberately.

**Acceptance Scenarios**:

1. **Given** the crosshair is over a solid block within reach, **When** the
   player aims at it, **Then** a wireframe outline marks that block and no other.
2. **Given** the player holds the break button on a block, **When** enough time
   passes for the block's break duration to elapse, **Then** the block is removed
   and its drop enters the player's inventory; if the button is released early,
   progress is discarded.
3. **Given** the player aims at a different block mid-break, **When** the target
   changes, **Then** break progress resets to zero for the new target.
4. **Given** the player has a placeable block selected and aims at a valid
   surface, **When** they use the place button, **Then** the block appears in the
   adjacent cell indicated by the face they aimed at.
5. **Given** the placement would occupy the space the player's body currently
   fills, **When** the player attempts to place, **Then** nothing is placed and
   no error is raised.
6. **Given** the particles setting is on, **When** a block finishes breaking,
   **Then** debris is rendered from the broken cell and clears shortly after;
   **and given** the setting is off, **When** the same block breaks, **Then** the
   block still breaks and its drop is still collected, with no debris rendered
   (FR-045).

---

### User Story 3 - Gather, store and craft (Priority: P3)

The player opens a 36-slot inventory, sees the blocks they have collected, moves
and stacks them, and opens a crafting panel. Recipes they can afford are lit up;
recipes they cannot afford are greyed out. They craft planks, then sticks, then
a pickaxe, equip it, and mine stone far faster than they could with bare hands.

**Why this priority**: Progression gives the player a reason to keep reshaping
the world. It depends on the break/place loop, so it follows it in priority.

**Independent Test**: From a fresh world, collect wood, craft planks, sticks and
a wooden pickaxe, then mine stone. Deliverable value: a complete gather-craft-use
loop with no other systems required.

**Acceptance Scenarios**:

1. **Given** the inventory holds a stack of 60 items, **When** a 4-item stack is
   added to it, **Then** the stack reaches the maximum of 64 and the excess
   spills into the next free slot rather than being lost.
2. **Given** a recipe whose ingredients are all present, **When** the player
   crafts it, **Then** exactly the documented ingredient counts are consumed and
   exactly the documented output count is produced.
3. **Given** a recipe whose ingredients are insufficient, **When** the player
   attempts to craft it, **Then** the craft is rejected and the inventory is
   unchanged.
4. **Given** a player holding a tool below the required tier, **When** they break
   a block that demands a higher tier, **Then** no drop is produced.
5. **Given** a tool with remaining durability, **When** it breaks a block, **Then**
   its durability decreases by one use; when durability reaches zero the tool
   is consumed.

---

### User Story 4 - Reproduce a world exactly from its seed (Priority: P4)

A player writes down a seed, later types it back in, and finds the same mountain,
the same cave mouth, the same tree line and the same shoreline they remember.
Two players exchanging a seed see the same world.

**Why this priority**: Deterministic reproduction is the product's defining
promise. It can be verified as soon as world generation exists, so it sits just
after the core interaction loop.

**Independent Test**: Generate the same seed twice in separate sessions and
compare a snapshot of the world data. Deliverable value: seeds are shareable and
trustworthy.

**Acceptance Scenarios**:

1. **Given** a world generated with a fixed seed, **When** it is regenerated
   after a restart, **Then** a byte-level comparison of the generated terrain is
   identical.
2. **Given** a world generated with seed A and a world generated with seed B,
   **When** both are compared, **Then** their terrain differs.
3. **Given** regions requested in different orders across two runs of the same
   seed, **When** features straddling region boundaries (such as trees) are
   compared, **Then** they agree exactly regardless of the order regions were
   produced in.

---

### User Story 5 - Save, resume and manage worlds (Priority: P5)

The player quits mid-session, comes back the next day, chooses **Load World**,
picks their world by name, and is standing in the exact spot they left with their
inventory, their half-built structure and the world's clock intact.

**Why this priority**: Persistence protects the player's investment. It matters
more than cosmetic or atmospheric systems because losing progress is the most
damaging failure the product can have.

**Independent Test**: Play, save, quit, reload, and diff the restored state
against the saved state. Deliverable value: progress survives a restart.

**Acceptance Scenarios**:

1. **Given** an in-progress world, **When** it is saved and then loaded,
   **Then** seed, elapsed time, player position and facing, health, hotbar
   selection, full inventory and block modifications are restored exactly from
   the record, and creatures reappear exactly as they were, reconstructed from
   the seed and the restored elapsed time rather than stored.
2. **Given** a world running, **When** sixty seconds of game time elapse or the
   player pauses, **Then** a save occurs without interrupting play.
3. **Given** a saved world whose data is truncated or contains out-of-range
   values, **When** the player attempts to load it, **Then** a clear
   non-transactional message is shown offering to delete the save, and the game
   remains usable.
4. **Given** settings changed by the player, **When** the game is restarted,
   **Then** the settings are still in effect independently of any world save.

---

### User Story 6 - Live in a world that changes over time (Priority: P6)

As the player explores, the sky cycles from sunrise through noon, sunset and
midnight; lighting shifts to match; the moon appears once the sun is down. They
wade into a lake, swim slower than they walk, and spot a neutral creature
ambling through a forest, pausing, walking, and refusing to wander off a cliff.

**Why this priority**: Atmosphere and life make the world worth inhabiting, but
the game remains fully playable without them. They are enrichment, not foundation.

**Independent Test**: Sit still for one full day-length and observe the lighting
keyframes and celestial bodies; watch a forest creature for one minute.
Deliver value: a world that feels alive.

**Acceptance Scenarios**:

1. **Given** a running world, **When** the day cycle advances, **Then** the sky
   colour, ambient and directional lighting pass through the documented keyframes
   at sunrise, noon, sunset and midnight in that order and repeat.
2. **Given** the sun below the horizon, **When** the player looks at the sky,
   **Then** the moon is visible.
3. **Given** the player in water, **When** they attempt to move, **Then** they
   move at 40% of normal speed and are not blocked by water.
4. **Given** a forest region, **When** it is generated, **Then** it contains a
   deterministic number of creatures derived from the seed, and each creature
   alternates between idling and wandering without stepping off a drop greater
   than one block.
5. **Given** an enclosed cave with no opening to the sky, **When** the player
   enters it, **Then** it is dark until a torch is placed, and placing one
   brightens the emitting cell and the cells up to the documented falloff
   distance while a cell outside that radius stays dark.

---

### User Story 7 - Tune, monitor and learn the game (Priority: P7)

A player opens Settings and lowers view distance to raise frame rate toward the
SC-003 envelope (≥30 fps for ≥95% of a 5-minute sprint), raises field of view,
adjusts mouse sensitivity and volume, and sees each change take
effect immediately and survive a restart. They press the debug key to read frame
rate, position and loaded-region counts, and consult the Controls screen when
they forget a key.

**Why this priority**: Comfort and diagnosability raise retention but the game is
fully playable at defaults without any of it.

**Independent Test**: Change every setting, restart, confirm persistence; open
the debug overlay and confirm every listed value is present and changes during
play. Deliverable value: the player can adapt the game to their machine.

**Acceptance Scenarios**:

1. **Given** the settings screen, **When** view distance is changed, **Then**
   the change is visible immediately and retained after a restart, and the value
   stays within the supported range.
2. **Given** the game running, **When** the debug key is pressed, **Then** an
   overlay reports frame rate, draw calls, triangles, player coordinates, region
   coordinates, seed, loaded and visible region counts, selected block, velocity
   and an available memory estimate.
3. **Given** the pointer is locked for play, **When** capture is refused or the
   player leaves the game surface, **Then** the game pauses instead of
   continuing unseen.
4. **Given** a player who has remapped a control, **When** they restart the game,
   **Then** the remapping is still in effect, and **when** they choose to restore
   defaults, every binding returns to its documented default.
5. **Given** the game rendered in greyscale, **When** the player aims at a block,
   **Then** the target outline remains distinguishable from the surrounding
   terrain and the health indicator remains readable.

---

### Edge Cases

- **Seed left blank**: the documented default seed is used silently.
- **Seed outside numeric range or malformed**: input is rejected at entry with a
  prompt to correct it; no world is created.
- **World name blank, longer than 32 characters, or reduced to nothing by
  trimming**: rejected at entry with a prompt to correct it; no world is created.
- **World name differing from an existing world only by case or surrounding
  space**: the overwrite confirmation is shown before the existing world is
  replaced.
- **Placing a block against the last block within reach**: placement is refused.
- **Placing into water or an occupied cell**: only water may be replaced; an
  occupied non-water cell refuses placement.
- **Breaking the block beneath the player**: the player falls and lands on
  whatever is below; they cannot fall out of the world because the bottom layer
  is solid.
- **Inventory completely full**: a drop with nowhere to go is discarded rather
  than duplicating or crashing, and play continues.
- **Crafting with a partially consumable inventory** (ingredients spread across
  several stacks): consumption occurs in a fixed, documented slot order so the
  result is reproducible.
- **Save data corrupt, truncated, wrong schema version, or containing
  out-of-range numbers**: never throws to the player; a recoverable message with
  a delete option is offered.
- **Rapid save/load cycles**: no duplicate world records are created.
- **World opened in a second session while already open elsewhere**: the second
  open is refused with a clear message until the first session closes it, so
  neither session's changes can silently overwrite the other's.
- **Save write fails (storage full, quota exceeded, permission denied)**: the
  write is reported as failed rather than successful, a visible notice stays on
  screen until a later save succeeds, and play continues.
- **Regions requested faster than they can be produced**: generation is bounded
  per tick and meshing per frame, so the game slows its loading rather than
  freezing input.
- **Feature straddling a region boundary** (a tree rooted just outside the
  region being built): the result is identical no matter which region is
  produced first.
- **Pointer lock denied, or focus lost mid-play**: auto-pause with a visible
  resume prompt.
- **Attempting to exceed the supported view distance range**: clamped to the
  supported minimum and maximum.
- **Loading a world while a save of the same name is in progress**: the load
  waits for the save to finish so a half-written world is never opened.
- **Automatic and manual save requested at the same moment**: the requests are
  serialised rather than interleaved, no partial record is written, and rapid
  save/load cycles still create no duplicate records.
- **First run — no saved worlds and no changed settings**: the game starts from
  documented defaults, and Load World shows an empty state explaining that no
  worlds exist yet rather than an error.
- **Automatic save fails in the background**: because automatic save gives no
  direct feedback, the same persistent notice as a failed manual save (FR-022) is
  shown until a later save succeeds.
- **Player switches tab, minimises, or closes the page mid-play**: FR-022 issues a
  save as soon as the page becomes hidden, before any teardown, so that reopening
  restores the world as it stood at that moment; a save still in flight is awaited
  by the next load rather than being read half-written.
- **Placing a block at the world's vertical limits**: placement above the top
  layer is refused; the bottom layer is solid, so nothing can be built beneath it.
- **Tool durability reaches zero on the break that depletes it**: the break
  completes and its drop is collected normally, and only then is the tool removed
  from the inventory.
- **Drop with an empty inventory**: as with a completely full one, the drop is
  discarded rather than duplicated, and play continues.
- **Light crossing a region boundary**: a torch near a border illuminates cells
  in the neighbouring region, so that neighbour is recomputed and remeshed
  through the FR-014 path and the light appears within one frame refresh
  (SC-011); the illumination is identical regardless of which of the two regions
  was generated or meshed first.

## Requirements *(mandatory)*

### Functional Requirements

> **Ordering note**: FR identifiers are stable keys, so this list is ordered by
> topic rather than by number. FR-043, FR-044 and FR-045 were introduced by later
> clarification sessions and therefore sit beside the requirements they amend —
> FR-044 after FR-029 (lighting and the day-night cycle), FR-043 and FR-045 after
> FR-037 (interface and presentation). FR-046 sits after FR-040, the requirement
> it makes observable. Read the identifiers, not the sequence.

**World creation and generation**

- **FR-001**: The system MUST create a new world from a player-supplied name and
  seed, and MUST substitute the documented default seed when the seed field is
  left blank. A world name MUST be 1–32 printable characters after trimming
  surrounding space; a blank name is rejected, and a name matching an existing
  world only by case or surrounding space requires explicit confirmation to
  overwrite.
- **FR-002**: The system MUST generate terrain containing at least five distinct
  biomes — plains, forest, desert, snow and mountain — selected from local
  temperature and moisture conditions using a fixed, documented precedence.
- **FR-003**: The system MUST generate sea-level water, beaches, caves, coal and
  iron deposits, and trees.
- **FR-004**: The system MUST present the world as a bounded-height, unbounded-in-
  extent blocky landscape that reveals more terrain as the player travels, within
  a player-adjustable view distance. Height and region size are fixed: the world
  is 128 blocks tall (y from 0 to 127), a region is 16 × 16 blocks horizontally
  across that full height — 32,768 blocks in total — and sea level sits at
  y = 40. Only the horizontal extent is unbounded. These values are listed in
  Documented Values.
- **FR-005**: The system MUST produce an identical world for an identical seed on
  every run, independent of load order, timing or hardware.

**Movement and physics**

- **FR-006**: The player MUST be able to walk, sprint, jump and look around in
  first person, and MUST be stopped by solid terrain rather than passing through
  it.
- **FR-007**: The system MUST resolve collisions axis by axis so the player
  slides along walls and can step up small ledges without jumping.
- **FR-008**: The player MUST be able to swim, moving at 40% of normal speed,
  and MUST NOT be blocked by water.
- **FR-009**: The system MUST pause automatically on any of these three events —
  pointer capture refused, pointer capture lost, or the game surface losing
  visibility or focus — through one single pause path, and MUST resume only on an
  explicit player action. All three events MUST behave identically: pause, show
  the pause overlay, and stop advancing the simulation.

**Interaction**

- **FR-010**: The system MUST outline the block currently under the crosshair and
  within reach, where reach is the distance given in Documented Values, measured
  from the player's eye; blocks beyond it MUST NOT be outlined.
- **FR-011**: The player MUST be able to break a targeted block by holding the
  break control, with progress proportional to elapsed time against that block's
  break duration, resetting when the target changes.
- **FR-012**: The player MUST be able to place the selected block onto the face
  they aimed at, provided the destination is empty or water and does not overlap
  the player's body.
- **FR-013**: Each block type MUST define a hardness, whether it is solid and
  whether it is transparent, and MUST define what breaking it drops, including
  the possibility of nothing.
- **FR-014**: The system MUST mark a region for remeshing when any block inside
  it changes, including adjacent regions when the change is on a boundary.

**Inventory, crafting and tools**

- **FR-015**: The system MUST provide a fixed-size inventory with a hotbar
  subset, stack items up to a documented maximum, and allow items to be moved,
  split and merged between slots.
- **FR-016**: The player MUST be able to select a hotbar slot by number key and
  by scroll wheel.
- **FR-017**: The system MUST offer a fixed recipe list in which unaffordable
  recipes are visibly unavailable, and MUST consume and produce exactly the
  documented quantities for every craft.
- **FR-018**: A block's drop definition under FR-013 MAY carry a minimum tool
  tier. When the equipped tool's tier is below that minimum the block MUST yield
  nothing; at or above it, the block MUST yield exactly the drop FR-013 declares.
- **FR-019**: Tools MUST have finite durability that decreases by one per block
  broken and MUST be consumed at zero.
- **FR-020**: The system MUST draw item icons procedurally rather than loading
  pre-made artwork.

**Persistence**

- **FR-021**: The system MUST save, per world: its name, its seed, elapsed
  simulation time (measured in ticks — see Documented Values), player position,
  orientation, health, hotbar selection, full inventory, and all block
  modifications made by the player. Creatures are deliberately excluded from the
  record: they are reconstructed from the seed and the restored tick (FR-028,
  FR-029), which keeps the save bounded to what the player actually authored even
  though the world's horizontal extent is unbounded. This list is exhaustive: a
  record that omits any element named here MUST NOT satisfy SC-007.
- **FR-022**: The system MUST save automatically every 60 seconds of game time,
  whenever the game pauses for any reason (including the automatic pause of
  FR-009 and the inventory pause of FR-032), and whenever the page becomes hidden
  — tab switched away, window minimised, or the page closing — so that no
  progress is lost on exit. It MUST also allow a manual save from the pause menu.
  A save whose write failed MUST NOT be reported as successful — whatever the
  cause, including storage full, quota exceeded and permission denied — and the
  system MUST show a visible notice that persists until a subsequent save
  succeeds. Concurrent save requests MUST be serialised so that no partial record
  is ever written.
- **FR-023**: The system MUST list, load and delete saved worlds by name from the
  main menu, and MUST refuse to open a world that is already open in another
  session until that session closes it. Deletion and overwrite are irreversible
  and MUST each require an explicit confirmation step that says so.
- **FR-024**: The system MUST validate every saved field on load and MUST handle
  corrupt or unsupported data with a non-fatal message offering deletion, never
  with a crash or silent partial load.
- **FR-025**: The system MUST store settings separately from world data so that
  deleting a world never discards the player's settings.
- **FR-026**: The system MUST serialise world data in a fixed key order with an
  explicit schema version so that saves are byte-stable and detectably outdated.

**Living world**

- **FR-027**: The system MUST advance a repeating day-night cycle through the
  lighting keyframes listed in Documented Values — sunrise, noon, sunset,
  midnight, in that order and then repeating — interpolating linearly between
  adjacent keyframes. Time-of-day MUST be derived solely from the simulation tick
  counter required by FR-029 and MUST NOT be derived from elapsed wall-clock
  time. The system MUST show the moon while the sun is below the horizon.
- **FR-028**: The system MUST spawn a neutral wandering creature in forest
  regions at a count derived from the seed, alternating between idling and
  walking and refusing to step off drops greater than one block. Creatures MUST
  be re-derived identically whenever a region loads and whenever the world is
  reopened, at the state implied by the current tick, so that no creature state
  is ever persisted (FR-021). Only creatures in regions inside the retained view
  distance are simulated, so their total number stays bounded.
- **FR-029**: All world and creature advancement MUST occur at a fixed simulated
  rate independent of frame rate, with rendering interpolating between steps.
  Advancement MUST follow a defined order — regions by (distance, region
  coordinates) and creatures by ascending identity — so that a simulation history
  depends only on the seed, the player's inputs and the tick number, and is
  independent of render order, loading order and machine performance.
- **FR-044**: The system MUST illuminate the world from two independent light
  levels, each on the documented 0–15 scale, taking each cell's illumination as
  the greater of the two. **Skylight** enters from above the top layer at the
  documented maximum and is occluded by opaque blocks, so an enclosed space or
  cave with no opening to the sky receives none. **Block light** is emitted by a
  placed light-emitting block at the documented source level and decreases by
  exactly one level per block propagated through non-opaque cells, reaching zero
  at the documented distance; the torch is the only source this version ships.
  Surface brightness MUST combine that skylight with the FR-027 keyframe's
  ambient and directional values, and time of day MUST still derive solely from
  the simulation tick counter (FR-029). Any block change MUST recompute lighting
  for the changed region and for any region whose light crosses its boundary,
  through the same remesh path as FR-014, so that a light change appears within
  one frame refresh alongside the block change (SC-011). Illumination MUST be a
  pure function of block data and the simulation tick — independent of load
  order, meshing order and hardware — so that it introduces no new source of
  divergence (FR-005).

**Interface and feedback**

- **FR-030**: The system MUST present a main menu offering New World, Load World,
  Settings and Controls.
- **FR-031**: The system MUST present a heads-up display showing a crosshair,
  hotbar with slot selection, health, current coordinates and break progress.
- **FR-032**: The system MUST present an inventory screen with drag-and-drop
  slots, stack counts, item icons and an adjacent crafting panel. Opening it
  releases pointer capture and therefore pauses the simulation under FR-009 and
  triggers a save under FR-022; the world resumes only when the player closes
  the screen. That screen MUST close on either Escape or E, and Escape pressed
  while the inventory is open MUST close it and return to play rather than open
  the pause menu. The inventory screen and the pause menu are mutually exclusive
  and MUST never be shown together, so the pause menu is reachable only by
  pressing Escape again once play has resumed — one press in, one press out.
- **FR-033**: The system MUST present a pause menu offering Resume, Settings,
  Save and return to Main Menu.
- **FR-034**: The system MUST offer settings for view distance, field of view,
  particles, mouse sensitivity and master/effects/music volume, all persisted
  across sessions and applied immediately. Each MUST have its range or permitted
  values stated in Documented Values, and a value outside that range MUST be
  clamped rather than rejected. The particles setting MUST affect presentation only -
  see FR-045.
- **FR-035**: The system MUST offer a debug overlay reporting frame rate, draw
  calls, triangle count, player and region coordinates, seed, loaded and visible
  region counts, selected block, velocity and a memory estimate when available.
- **FR-036**: The system MUST produce every sound procedurally at runtime rather
  than loading audio files. The audible set is **closed and exhaustive** — exactly
  six effects, one for each of: a block breaking, a block being placed, an item
  being crafted, the selected hotbar slot changing, a menu selection being made,
  and a failed save being reported under FR-022 — plus one looping ambient music
  track. No other sound may be produced. Each effect MUST fire only on the event
  it names, so this requirement is checked item by item against the list rather
  than by impression. Effects and music are separate volume channels, each scaled
  by the master volume (Documented Values), which is what makes all three volume
  controls required by FR-034 live rather than decorative.
- **FR-037**: This requirement states two separate clauses.
  **(a) Binding exposure.** The system MUST expose every binding listed in the
  controls table of Documented Values. Exposure means the binding map exists and
  is seeded from those documented defaults; making them *remappable*, restoring
  defaults and persisting remappings is FR-041, not this clause.
  **(b) Pointer-lock refusal.** When pointer lock is rejected it MUST behave as
  follows: show a message naming the refusal together with an affordance to
  retry, and leave the game paused — never running without pointer capture.
  *Clarification of the relation to FR-009:* the refusal message **is** the
  FR-009 pause overlay carrying refusal-specific text plus a retry control, not a
  second screen. FR-009's "all three events MUST behave identically" is satisfied
  because pointer refused, pointer lost and surface hidden all show that same
  overlay and all stop the simulation; only the refusal case additionally names
  the cause and offers the retry affordance. The three are identical in *state
  outcome* (paused + overlay), and differ only in overlay copy.
- **FR-043**: On a player's first run only, the system MUST show a hint overlay
  beside the crosshair naming the break and place controls. It MUST dismiss
  itself once the player has both broken a block and placed a block, and MUST NOT
  appear on any later run. It exists to make SC-005 achievable, since that
  criterion forbids consulting documentation.
- **FR-045**: The system MUST render particles as visual feedback when a block
  breaks (debris thrown from the broken cell) and when the player enters water
  (a splash at the surface), each gated by the particles setting of FR-034.
  Particles MUST be presentation only: they carry no state, are not serialised
  (FR-021), and are read by no world or creature computation (FR-029). A
  particle's origin and motion MUST be a pure function of the triggering event
  and the simulation tick, so that adding them cannot introduce nondeterminism
  into anything the product measures (FR-005).

**Content and quality**

- **FR-038**: All art, sound, interface text and code MUST be original to this
  product; no third-party game's names, textures, sounds, interface or code may
  be used.
- **FR-039**: The system MUST bound per-step world generation to a documented
  maximum number of regions per tick, and per-frame meshing to a documented
  maximum number of regions per frame, as two separately stated and separately
  verifiable limits, so that input remains responsive while terrain streams in.
  *Here "responsive" means measurable and not free-floating:* input and rendering
  stay within the envelope SC-003 states and measures — ≥30 fps for ≥95% of a
  5-minute sprint session with no freeze >250 ms — under the highest supported
  view distance, while terrain streams in. FR-039 supplies the two per-tick and
  per-frame bounds; SC-003 supplies the number they must preserve.
  The system MUST release the rendering resources of any region outside the
  retained view distance — including when the view distance setting is lowered —
  and MUST retain no more regions than those intersecting the current view
  distance plus the stated retention margin, so that a session of an hour or more
  does not accumulate regions or buffers without bound.
- **FR-040**: The system MUST complete a full play session — enter world, move,
  break, place, craft, save, reload, load — with no errors surfaced to the player
  on the nominal path; the recovery messages required by SC-008 and FR-022 are
  not errors and do not count against this requirement.
- **FR-046**: The game MUST be runnable from the delivered page with no
  installation step. Exactly one entry point may start it — one place that
  connects the simulation, the rendering, the world and the player's input, and
  then begins play — and nothing else in the product may start a session or
  connect those parts together. The path from a region the world has loaded to
  the picture on screen MUST be complete within the same requirement: every such
  region is drawn, and a region that leaves the retained view distance has its
  rendering resources released (FR-039). This is the precondition for FR-030,
  FR-040 and every US1 acceptance scenario — until it exists the delivered page
  shows an empty element and none of them can be observed — so its absence is a
  missing requirement, not an exemption granted by a completed phase gate. The
  entry point MUST be independent of FR-030: the main menu, when present, is a
  screen it shows before play begins and never a second entry point, so there is
  exactly one place that connects the parts however a session starts.

**Accessibility**

- **FR-041**: Every control binding listed in Documented Values MUST be
  remappable by the player, with a way to restore all defaults, and remappings
  MUST persist across sessions. Target-selection and health feedback MUST be
  distinguishable without relying on colour alone. Every menu and screen MUST be
  fully operable with the keyboard alone, with a visible focus indicator on the
  currently selected control.
- **FR-042**: The player's health MUST be initialised to its maximum when a world
  is created or loaded, and no action available in this version may change it;
  the value exists to be displayed (FR-031) and persisted (FR-021).

### Key Entities

- **World**: A named, seeded instance of the landscape. Holds the seed, elapsed
  simulation time, the set of player-made block modifications layered over
  generated terrain, and its creatures. Identified by its name — 1–32 printable
  characters, trimmed of surrounding space, compared ignoring case and ignoring
  surrounding space — matching FR-001 and the one-save-per-name assumption.
- **Player**: The avatar inside a world. Holds position, facing, health, the
  currently selected hotbar slot and the full inventory.
- **Inventory Slot**: One cell holding an item identity, a quantity up to the
  stack maximum, and optional remaining durability.
- **Block Type**: A catalogue entry describing a material's hardness, solidity,
  transparency, tool class, minimum tool tier and drop behaviour.
- **Tool**: An inventory item with a tier, a break-speed multiplier and finite
  durability.
- **Recipe**: A mapping from a set of ingredient quantities to a produced output,
  identified by a unique stable key.
- **Creature**: A seeded, non-player inhabitant with an identity, position,
  health, and an idle/wander behaviour state.
- **Save Record**: The serialised snapshot of a World plus its Player, carrying
  an explicit schema version and written in a fixed key order.
- **Settings**: Player preferences persisted independently of any World.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can go from launching the game to standing in a new world
  in under 30 seconds on the reference machine, timed with a stopwatch from the
  first rendered menu frame to the first frame in which the player has spawned
  and can move.
- **SC-002**: 100% of repeated world generations using the same seed produce
  byte-identical terrain — compared region by region over the same set of
  requested regions, as whole block arrays — across at least 10 consecutive runs
  and across restarts, established by automated comparison rather than by eye.
- **SC-003**: During a 5-minute session of continuous sprinting across
  freshly-revealed terrain at default settings on the reference machine, frame
  rate stays above 30 fps for at least 95% of the session — sampled once per
  second from the debug-overlay readout required by FR-035 — with no visible
  freeze longer than 250 ms. This is the designated worst-case scenario; the
  250 ms freeze limit applies to all other in-game activity as well.
- **SC-004**: A player can target, break and collect a block within 5 seconds of
  first aiming at it, using an appropriate tool, timed with a stopwatch from the
  moment the block is first outlined to the moment its drop enters the inventory.
- **SC-005**: A first-time player completes the sequence "enter a world, break a
  block, place a block" within 2 minutes of starting, without consulting
  documentation, in at least 90% of at least 10 observed attempts taken across at
  least 5 first-time players.
- **SC-006**: Given the ingredients on hand, a player crafts a pickaxe in under
  60 seconds using only the in-game interface, timed with a stopwatch from the
  moment those ingredients are held in the inventory.
- **SC-007**: 100% of save-then-load cycles restore world state exactly — zero
  discrepancies when comparing the restored snapshot against the saved snapshot,
  using every element named by FR-021 as the comparison set.
- **SC-008**: 100% of deliberately corrupted or truncated saves are handled
  without terminating the game; each presents a recoverable path in under 3
  seconds.
- **SC-009**: 100% of settings changes take effect immediately and remain in
  effect after a full restart of the game.
- **SC-010**: The session sequence FR-040 normatively requires — main menu →
  world entry → movement → breaking → placing → crafting → saving → reloading →
  re-loading — is observed end to end with **zero errors shown to the player** on
  the nominal path, the recovery messages required by SC-008 and FR-022
  excluded. FR-040 carries the MUST; this criterion carries only the measurable
  observation, so the two are one requirement and its criterion rather than two
  independent prohibitions.
- **SC-011**: 100% of block changes made on a region boundary are reflected in
  the neighbouring region's appearance within one frame refresh.
- **SC-012**: Zero copyrighted or third-party game assets, names or code are
  present, verified by a content review of all shipped assets.
- **SC-013**: 100% of failed save writes are surfaced to the player as failures —
  no failed write is ever reported, or left on screen, as a successful save, and
  the notice clears within one successful save.
- **SC-014**: A saved world opened from the Load World menu reaches a playable,
  fully restored state in under 10 seconds on the reference machine, timed with
  a stopwatch from the selection of the world to the first frame in which the
  player can move.

## Assumptions

- **Single player only.** No networking, multiplayer, accounts or cloud sync are
  in scope; worlds are stored locally on the player's machine.
- **Desktop play only.** Keyboard and mouse with pointer capture are required;
  touch and gamepad input are out of scope for this version.
- **Neutral creature, no combat loop.** The creature is observed, not fought.
  No damage, death or respawn system is in scope beyond displaying the player's
  health value; consequently health never changes (FR-042). *If this assumption
  is ever false, FR-021, FR-031 and FR-042 must be reopened together.*
- **No smelting step.** Glass is produced directly from sand as a documented
  simplification; there is no furnace or intermediate processing station.
- **World height is fixed and finite; horizontal extent is unbounded** but
  practically limited by the adjustable view distance.
- **English-only interface text.** Localisation is out of scope.
- **View distance is bounded** to a documented minimum and maximum; values
  outside the range are clamped rather than rejected.
- **Procedural content only.** All textures are generated at runtime and all
  audio is synthesised at runtime; no binary art or sound assets ship with the
  product.
- **Bottom of the world is solid**, so a player can never fall out of it; there
  is no void damage.
- **One save per world name.** Names are compared ignoring case and surrounding
  space, and creating a world whose name matches an existing one under that
  comparison requires explicit confirmation to overwrite.
- **Determinism is a product requirement, not a convenience.** It is asserted by
  automated checks, not merely observed by eye.
- **Reference machine for performance criteria.** SC-001, SC-003 and SC-014 are
  measured on a stated minimum specification: a laptop with integrated graphics
  and no discrete GPU, no more than five years old at the time of measurement,
  running at default settings, at a 1280×720 window size in a current stable
  release of a supported desktop browser. Measurements taken on any other machine
  are informational only and cannot pass or fail those criteria. *If this
  assumption is false, those three criteria cannot be evaluated.*

**Classification of assumptions.** The first seven assumptions and the
procedural-content assumption are scope decisions set by this specification:
they cannot fail — changing one changes the specification rather than
invalidating an requirement. The solid-bottom assumption and the reference-machine
assumption are testable; each is annotated above with the requirements that must
be reopened if it proves false.

## Non-Goals

Explicitly out of scope for this version. Their absence is a decision recorded
here, not a gap in the specification:

- Networking, multiplayer, accounts, cloud sync or any server component.
- Touch and gamepad input.
- Combat, damage, death or respawn; the creature cannot be attacked.
- Smelting, furnaces or any intermediate processing station.
- Localisation; interface text is English only.
- Void damage or falling out of the world.
- Any third-party game's name, texture, sound, interface element or code.
- Dynamic shadow mapping. The `shadows` control that earlier drafts carried is
  deliberately removed rather than implemented: no requirement ever defined a
  shadow, and a shadow map was judged the addition most likely to break SC-003 on
  the reference machine (FR-034, FR-045).

## Documented Values

Normative values referenced by the requirements above. Each requirement that
says "documented" resolves to this section. Nothing here may change without a
corresponding change to the requirement that cites it, and where a shipping
document disagrees with this section, **this section wins**.

### Simulation, world and interaction

| Value | Definition | Cited by |
|---|---|---|
| Default seed | `123456789`, substituted when the seed field is left blank | FR-001 |
| Seed range | Whole numbers from −2147483648 to 2147483647. Decimals, text and out-of-range values are rejected at entry with a prompt to correct them | FR-001 |
| World height | 128 blocks, y from 0 to 127; y below 0 or at/above 128 reads AIR and any write there is refused | FR-004 |
| Region size | 16 × 16 blocks horizontally across the full height — 32,768 blocks per region | FR-004, FR-014 |
| Sea level | y = 40; terrain at or below sea level is filled with water, and beaches form above it | FR-003, FR-004 |
| Simulation rate | 20 ticks per second; one tick = 0.05 s of game time | FR-029 |
| Elapsed time | Measured in simulation ticks — the only time source; never wall-clock seconds | FR-021, FR-022 |
| Auto-save interval | 60 seconds of game time | FR-022 |
| Reach | 5.0 blocks from the player's eye | FR-010, FR-012 |
| Step-up height | Ledges no taller than one block | FR-007 |
| Gravity | 32 blocks per second squared, applied once per simulation tick | FR-006, FR-007 |
| Jump velocity | 10 blocks per second upward, applied once when jump is pressed while grounded | FR-006, FR-007 |
| Jump integration | Semi-implicit (symplectic) Euler stepped at the 20 ticks/s rate — velocity updated from gravity first, then position from the updated velocity, exactly once per tick — so the jump trajectory and its apex are a single reproducible value asserted with no tolerance | FR-006, FR-029 |
| Swim speed | 40% of normal movement speed | FR-008 |
| Day length | 600 seconds of game time from one sunrise to the next | FR-027 |
| Health maximum | 10 | FR-042, FR-031 |
| View distance | 2–12 regions, default 6 | FR-004, FR-034 |
| Retention margin | One region beyond the view distance | FR-039 |
| Generation bound | At most 2 regions generated per tick | FR-039 |
| Meshing bound | At most 2 regions meshed per frame | FR-039 |
| Stack maximum | 64 items per inventory slot | FR-015 |
| Ingredient consumption order | Ascending inventory slot index, slot 0 first, so a craft spanning several partial stacks always resolves identically | FR-017, FR-015 |
| Light scale | 0–15 per cell; a cell's illumination is the greater of its skylight and its block-light level | FR-044 |
| Skylight level | 15 in a cell open to the sky above the top layer, occluded by opaque blocks, decreasing by exactly 1 per block propagated — an enclosed cave with no sky opening reads 0 | FR-044 |
| Torch light level | 14 at the emitting cell, decreasing by exactly 1 per block propagated through non-opaque cells and reaching 0 after 14 blocks | FR-044 |
| Volume controls | Three settings — master, effects, music — each a number in 0–1 (default 1), shown in the panel as 0–100%; a channel's audible level = its own volume × master volume | FR-034, FR-036 |
| Field of view | 60–110 degrees, default 75 | FR-034 |
| Mouse sensitivity | 0.0005–0.006 radians per pixel, default 0.002 | FR-034 |
| Particles | `on` (default) or `off`; presentation only, never state | FR-034, FR-045 |
| Ambient music | One procedurally synthesised loop, playing on the main menu and while a world is open, silenced only by the music volume control | FR-034, FR-036 |

### Lighting keyframes

FR-027, interpolated linearly between adjacent rows and repeating from midnight
back to sunrise:

| Keyframe | Fraction of day | Sky colour | Ambient | Directional |
|---|---|---|---|---|
| Sunrise | 0.00 | `#F2A65A` | 0.45 | 0.55 |
| Noon | 0.25 | `#87CEEB` | 0.85 | 1.00 |
| Sunset | 0.50 | `#E0663F` | 0.40 | 0.50 |
| Midnight | 0.75 | `#0B1026` | 0.15 | 0.00 |

### Biome precedence

FR-002 — evaluated in order, first match wins:

| Order | Biome | Condition |
|---|---|---|
| 1 | Snow | local temperature below −0.45 |
| 2 | Desert | temperature above 0.40 **and** moisture below 0 |
| 3 | Mountain | mountain mask above 0.35 |
| 4 | Forest | moisture above 0.15 |
| 5 | Plains | otherwise |

### Default control bindings

FR-037 — every entry is remappable under FR-041:

| Binding | Default |
|---|---|
| Move forward / back / left / right | W / S / A / D |
| Jump | Space |
| Sprint | Left Shift |
| Hotbar slots 1–9 | Digit 1 – Digit 9 |
| Cycle hotbar | Mouse wheel |
| Break block | Left mouse, held |
| Place block | Right mouse |
| Inventory | E |
| Pause | Escape |
| Debug overlay | F3 |

### Recipe quantities

FR-017 — a fixed list of 10 shapeless recipes, each identified by a stable
unique key; quantities are exact:

| Output | Ingredients |
|---|---|
| 4 Plank | 1 Wood |
| 4 Stick | 2 Plank |
| Wooden Pickaxe | 2 Plank + 2 Stick |
| Wooden Axe | 3 Plank + 2 Stick |
| Stone Pickaxe | 2 Stone + 2 Stick |
| Stone Axe | 3 Stone + 2 Stick |
| Iron Pickaxe | 2 Iron + 2 Stick |
| Iron Axe | 3 Iron + 2 Stick |
| 1 Glass | 1 Sand |
| 4 Torch | 1 Coal + 1 Stick |

Every recipe must have a distinct ingredient multiset, because matching is by
multiset alone; this is what keeps the pickaxe and the axe of each tier
unambiguous.

### Normative shipping documents

Two documents are normative for this specification and MUST ship with it:

- `docs/CONTROLS.md` — MUST reproduce the default control bindings table verbatim.
- `docs/GAME_DESIGN.md` — MUST reproduce the recipe and biome tables verbatim.

Both are deliverables of the implementation, not external inputs; the
specification does not depend on any document outside this repository.

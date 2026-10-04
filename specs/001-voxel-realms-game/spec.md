# Feature Specification: Voxel Realms

**Feature Branch**: `001-voxel-realms-game`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Read and follow VOXEL_REALMS_DETERMINISTIC_PROMPT.md to build the Voxel Realms deterministic voxel sandbox game"

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
   the player rises and lands at approximately the height predicted by the
   configured jump velocity and gravity.
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
3. **Given** chunks requested in different orders across two runs of the same
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
   selection, full inventory, block modifications and creatures are restored
   exactly.
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

---

### User Story 7 - Tune, monitor and learn the game (Priority: P7)

A player opens Settings and lowers render distance to smooth out play, raises
field of view, adjusts mouse sensitivity and volume, and sees each change take
effect immediately and survive a restart. They press the debug key to read frame
rate, position and loaded-chunk counts, and consult the Controls screen when
they forget a key.

**Why this priority**: Comfort and diagnosability raise retention but the game is
fully playable at defaults without any of it.

**Independent Test**: Change every setting, restart, confirm persistence; open
the debug overlay and confirm every listed value is present and changes during
play. Deliverable value: the player can adapt the game to their machine.

**Acceptance Scenarios**:

1. **Given** the settings screen, **When** render distance is changed, **Then**
   the change is visible immediately and retained after a restart, and the value
   stays within the supported range.
2. **Given** the game running, **When** the debug key is pressed, **Then** an
   overlay reports frame rate, draw calls, triangles, player coordinates, region
   coordinates, seed, loaded and visible region counts, selected block, velocity
   and an available memory estimate.
3. **Given** the pointer is locked for play, **When** capture is refused or the
   player leaves the game surface, **Then** the game pauses instead of
   continuing unseen.

---

### Edge Cases

- **Seed left blank**: the documented default seed is used silently.
- **Seed outside numeric range or malformed**: input is rejected at entry with a
  prompt to correct it; no world is created.
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
- **Regions requested faster than they can be produced**: generation is bounded
  per tick and meshing per frame, so the game slows its loading rather than
  freezing input.
- **Feature straddling a region boundary** (a tree rooted just outside the
  region being built): the result is identical no matter which region is
  produced first.
- **Pointer lock denied, or focus lost mid-play**: auto-pause with a visible
  resume prompt.
- **Attempting to exceed the supported render distance range**: clamped to the
  supported minimum and maximum.
- **Loading a world while a save of the same name is in progress**: the load
  waits for the save to finish so a half-written world is never opened.

## Requirements *(mandatory)*

### Functional Requirements

**World creation and generation**

- **FR-001**: The system MUST create a new world from a player-supplied seed, and
  MUST substitute the documented default seed when the seed field is left blank.
- **FR-002**: The system MUST generate terrain containing at least five distinct
  biomes — plains, forest, desert, snow and mountain — selected from local
  temperature and moisture conditions using a fixed, documented precedence.
- **FR-003**: The system MUST generate sea-level water, beaches, caves, coal and
  iron deposits, and trees whose density varies by biome.
- **FR-004**: The system MUST present the world as a bounded-height, unbounded-in-
  extent blocky landscape that reveals more terrain as the player travels, within
  a player-adjustable view distance.
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
- **FR-009**: The system MUST pause automatically when pointer capture is refused
  or the player leaves the game surface, and MUST resume only on player action.

**Interaction**

- **FR-010**: The system MUST outline the block currently under the crosshair and
  within reach.
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
- **FR-018**: The system MUST gate certain block drops behind a minimum tool
  tier, and MUST NOT produce a drop when the equipped tier is too low.
- **FR-019**: Tools MUST have finite durability that decreases by one per block
  broken and MUST be consumed at zero.
- **FR-020**: The system MUST draw item icons procedurally rather than loading
  pre-made artwork.

**Persistence**

- **FR-021**: The system MUST save, per world: its seed, elapsed time, player
  position, orientation, health and hotbar selection, full inventory, all block
  modifications made by the player, and all creatures.
- **FR-022**: The system MUST save automatically on a game-time interval and on
  pause, and MUST allow a manual save from the pause menu.
- **FR-023**: The system MUST list, load and delete saved worlds by name from the
  main menu.
- **FR-024**: The system MUST validate every saved field on load and MUST handle
  corrupt or unsupported data with a non-fatal message offering deletion, never
  with a crash or silent partial load.
- **FR-025**: The system MUST store settings separately from world data so that
  deleting a world never discards the player's settings.
- **FR-026**: The system MUST serialise world data in a fixed key order with an
  explicit schema version so that saves are byte-stable and detectably outdated.

**Living world**

- **FR-027**: The system MUST advance a repeating day-night cycle that moves
  through fixed lighting keyframes at sunrise, noon, sunset and midnight, and
  MUST show the moon while the sun is below the horizon.
- **FR-028**: The system MUST spawn a neutral wandering creature in forest
  regions at a count derived from the seed, alternating between idling and
  walking and refusing to step off drops greater than one block.
- **FR-029**: All world and creature advancement MUST occur at a fixed simulated
  rate independent of frame rate, with rendering interpolating between steps.

**Interface and feedback**

- **FR-030**: The system MUST present a main menu offering New World, Load World,
  Settings and Controls.
- **FR-031**: The system MUST present a heads-up display showing a crosshair,
  hotbar with slot selection, health, current coordinates and break progress.
- **FR-032**: The system MUST present an inventory screen with drag-and-drop
  slots, stack counts, item icons and an adjacent crafting panel.
- **FR-033**: The system MUST present a pause menu offering Resume, Settings,
  Save and return to Main Menu.
- **FR-034**: The system MUST offer settings for view distance, field of view,
  shadows, particles, mouse sensitivity and master/effects/music volume, all
  persisted across sessions and applied immediately.
- **FR-035**: The system MUST offer a debug overlay reporting frame rate, draw
  calls, triangle count, player and region coordinates, seed, loaded and visible
  region counts, selected block, velocity and a memory estimate when available.
- **FR-036**: The system MUST produce all sound effects procedurally rather than
  loading audio files.
- **FR-037**: The system MUST expose the documented control bindings and MUST
  behave as documented when pointer lock is rejected.

**Content and quality**

- **FR-038**: All art, sound, interface text and code MUST be original to this
  product; no third-party game's names, textures, sounds, interface or code may
  be used.
- **FR-039**: The system MUST bound per-step world generation and per-frame
  meshing work so that input remains responsive while terrain streams in, and
  MUST release resources for terrain outside the retained view distance.
- **FR-040**: The system MUST complete a full play session — enter world, move,
  break, place, craft, save, reload, load — with no errors surfaced to the player.

### Key Entities

- **World**: A named, seeded instance of the landscape. Holds the seed, elapsed
  simulation time, the set of player-made block modifications layered over
  generated terrain, and its creatures. Identified by its name.
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
  in under 30 seconds on a typical desktop machine.
- **SC-002**: 100% of repeated world generations using the same seed produce
  byte-identical terrain across at least 10 consecutive runs and across restarts.
- **SC-003**: During a 5-minute session of continuous sprinting across
  freshly-revealed terrain at default settings, frame rate stays above 30 fps for
  at least 95% of the session, with no visible freeze longer than 250 ms.
- **SC-004**: A player can target, break and collect a block within 5 seconds of
  first aiming at it, using an appropriate tool.
- **SC-005**: A first-time player completes the sequence "enter a world, break a
  block, place a block" within 2 minutes of starting, without consulting
  documentation, in at least 90% of observed attempts.
- **SC-006**: Given the ingredients on hand, a player crafts a pickaxe in under
  60 seconds using only the in-game interface.
- **SC-007**: 100% of save-then-load cycles restore world state exactly — zero
  discrepancies when comparing the restored snapshot against the saved snapshot.
- **SC-008**: 100% of deliberately corrupted or truncated saves are handled
  without terminating the game; each presents a recoverable path in under 3
  seconds.
- **SC-009**: 100% of settings changes take effect immediately and remain in
  effect after a full restart of the game.
- **SC-010**: A complete play session from main menu through world entry, movement,
  breaking, placing, crafting, saving, reloading and re-loading the world
  finishes with zero errors shown to the player.
- **SC-011**: 100% of block changes made on a region boundary are reflected in
  the neighbouring region's appearance within one frame refresh.
- **SC-012**: Zero copyrighted or third-party game assets, names or code are
  present, verified by a content review of all shipped assets.

## Assumptions

- **Single player only.** No networking, multiplayer, accounts or cloud sync are
  in scope; worlds are stored locally on the player's machine.
- **Desktop play only.** Keyboard and mouse with pointer capture are required;
  touch and gamepad input are out of scope for this version.
- **Neutral creature, no combat loop.** The creature is observed, not fought.
  No damage, death or respawn system is in scope beyond displaying the player's
  health value.
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
- **One save per world name.** Creating a world with an existing name requires
  explicit confirmation to overwrite.
- **Determinism is a product requirement, not a convenience.** It is asserted by
  automated checks, not merely observed by eye.

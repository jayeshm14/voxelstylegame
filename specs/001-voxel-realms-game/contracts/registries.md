# Contract: Registries (blocks, items, tools, recipes)

**Feature**: `specs/001-voxel-realms-game`
**Implements**: FR-013, FR-017, FR-018, FR-019, FR-020
**Consumers**: `world/BlockRegistry.ts`, `inventory/Items.ts`, `crafting/RecipeRegistry.ts`, tests `tools.test.ts`, `recipes.test.ts`

---

## Block registry — IDs are fixed and immutable

| ID | Name | Hardness | Solid | Transparent | Tool | Min tier | Drops |
|---|---|---|---|---|---|---|---|
| 0 | AIR | 0 | no | yes | — | — | none |
| 1 | GRASS | 0.6 | yes | no | shovel | 0 | DIRT |
| 2 | DIRT | 0.5 | yes | no | — | 0 | DIRT |
| 3 | STONE | 1.5 | yes | no | pickaxe | 1 | STONE |
| 4 | SAND | 0.5 | yes | no | — | 0 | SAND |
| 5 | WOOD | 2.0 | yes | no | axe | 0 | WOOD |
| 6 | LEAVES | 0.2 | yes | yes | — | 0 | none |
| 7 | WATER | — (unbreakable) | no | yes | — | — | none |
| 8 | COAL_ORE | 3.0 | yes | no | pickaxe | 1 | COAL |
| 9 | IRON_ORE | 3.0 | yes | no | pickaxe | 2 | IRON |
| 10 | GLASS | 0.3 | yes | yes | — | 0 | none |
| 11 | PLANK | 2.0 | yes | no | axe | 0 | PLANK |
| 12 | BRICK | 2.0 | yes | no | pickaxe | 1 | BRICK |
| 13 | SNOW | 0.2 | yes | no | — | 0 | SNOW |

**Culling rule** (FR-014): a face is emitted iff the neighbour is AIR, **or**
the neighbour is transparent **and** the neighbour id differs from this id.
Water next to water therefore culls its shared face.

**Break time**: `hardness / toolMultiplier`. The multiplier applies only when
the equipped tool's class matches the block's tool class and its tier ≥ min tier.
Blocks with a minimum tier drop **nothing** when broken at a lower tier.

---

## Item registry — non-block items start at 100

| ID | Name | Kind |
|---|---|---|
| 100 | STICK | material |
| 101 | COAL | material |
| 102 | IRON | material |
| 103 | TORCH | placeable block proxy |
| 110 | WOODEN_PICKAXE | tool |
| 111 | WOODEN_AXE | tool |
| 112 | STONE_PICKAXE | tool |
| 113 | STONE_AXE | tool |
| 114 | IRON_PICKAXE | tool |
| 115 | IRON_AXE | tool |

Block items reuse their block id (1–13). Non-block ids begin at 100, so the two
ranges can never collide.

---

## Tool tiers

| Tier | Material | Multiplier | Durability |
|---|---|---|---|
| 1 | WOOD | 2 | 60 |
| 2 | STONE | 4 | 132 |
| 3 | IRON | 6 | 250 |

Hand multiplier = 1 (always eligible, never satisfies a min tier > 0).

**Durability rule (FR-019)**: decrement by exactly 1 per block broken; at 0 the
tool is removed from its slot immediately — never left in the inventory at zero.

---

## Recipe registry — shapeless, matched by ingredient multiset

| Key | Ingredients | Output |
|---|---|---|
| `recipe.plank` | 1 WOOD | 4 PLANK |
| `recipe.stick` | 2 PLANK | 4 STICK |
| `recipe.wooden_pickaxe` | 2 PLANK + 2 STICK | 1 WOODEN_PICKAXE |
| `recipe.wooden_axe` | 3 PLANK + 2 STICK | 1 WOODEN_AXE |
| `recipe.stone_pickaxe` | 2 STONE + 2 STICK | 1 STONE_PICKAXE |
| `recipe.stone_axe` | 3 STONE + 2 STICK | 1 STONE_AXE |
| `recipe.iron_pickaxe` | 2 IRON + 2 STICK | 1 IRON_PICKAXE |
| `recipe.iron_axe` | 3 IRON + 2 STICK | 1 IRON_AXE |
| `recipe.glass` | 1 SAND | 1 GLASS |
| `recipe.torch` | 1 COAL + 1 STICK | 4 TORCH |

**Total: 10 recipes.**

### ⚠ Source contradiction resolved — see research.md R15

The source document states *both* `3 PLANK + 2 STICK → WOODEN_PICKAXE` and
`3 PLANK + 2 STICK → WOODEN_AXE`, while also mandating that pickaxe and axe be
"disambiguated by distinct ingredient counts." Two recipes cannot share a
multiset — shapeless matching keys on the multiset alone, so identical
ingredients would make both outputs simultaneously craftable and ambiguous.

**Resolution**: wooden pickaxe uses **2** planks, matching the stone and iron
pattern where pickaxe = 2 heads and axe = 3 heads. This satisfies the
distinct-count rule the source states as its intent, aligns all three tiers, and
requires no positional crafting.

### Matching rules

1. Matching is by multiset equality — order of ingredients is irrelevant.
2. Two recipes must never produce the same multiset (enforced by a registry
   self-check at startup).
3. Ingredients are consumed in **ascending slot order**, so a craft spanning
   several partial stacks resolves identically every time.
4. Evaluation is atomic: all ingredients present ⇒ consume exact counts and
   produce exact output; any shortage ⇒ reject with the inventory byte-identical
   to before.
5. The crafting panel lists every recipe, greying out those that are not
   currently craftable (FR-017).

---

## Self-check performed at startup

| Check | Failure meaning |
|---|---|
| Block ids 0–13 contiguous, no duplicates | Registry corrupted |
| Item ids disjoint from block ids | Id collision |
| Every `minTier` value has a matching tool tier | Tier gate unreachable |
| Every recipe multiset unique | Ambiguous crafting (R15 regression) |
| Every ingredient `id` exists in a registry | Craft output undefined |

## Test mapping

| Contract clause | Test |
|---|---|
| Break time for every (tool, block) pair; tier gate drops | `tools.test.ts` (full table) |
| Each recipe validates; exact consume/produce; shortage rejected | `recipes.test.ts` |
| Uniqueness of every recipe multiset | `recipes.test.ts` |
| Face culling incl. water-next-to-water | `mesher.test.ts` |
| Durability decrement and consumption at 0 | `tools.test.ts` |

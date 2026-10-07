# NAND Arena — your bot is a chip

A hardware bot league on **TapeOut × X Layer**. Players write a few lines of logic, the Bot Lab compiles it to NAND/LATCH gates, and one transaction tapes it out as a TapeOut circuit on the **NAND Arena processor**. A contract on X Layer then plays every bot against every other bot in a game of light cycles, running both circuits tick by tick, and pays the season's prize pool to whoever holds the winning circuit NFTs.

Built for the **TapeOut Genesis Transistor Hackathon** (IGNIX × TapeOut × X Layer).

**Live on X Layer mainnet (chain 196)**

| | |
|---|---|
| App | https://arena.nerom.site |
| Demo video (32 s) | [submission/nand-arena-reel.mp4](submission/nand-arena-reel.mp4) |
| **Processor (Circuits contract)** | [`0xCE56B1f17B7C270A0D5e0E8a097Ae5ab71D85BD5`](https://www.oklink.com/xlayer/address/0xCE56B1f17B7C270A0D5e0E8a097Ae5ab71D85BD5) |
| Transistors (ERC-1155) | [`0x01A8FD25712Af75cb77308DE6A6792aCB5c3Ce82`](https://www.oklink.com/xlayer/address/0x01A8FD25712Af75cb77308DE6A6792aCB5c3Ce82) |
| NandArena (processor creator, league, referee) | [`0x3fddB010FF747fFf0Fc7D1fA3e28aaFBA9bB3f64`](https://www.oklink.com/xlayer/address/0x3fddB010FF747fFf0Fc7D1fA3e28aaFBA9bB3f64) |
| Deployment wallet | [`0x68B75d5228b336E28346EC0A99A29290908B8Fb1`](https://www.oklink.com/xlayer/address/0x68B75d5228b336E28346EC0A99A29290908B8Fb1) |
| Deploy tx (`createCPU` via the TapeOut factory) | [`0x087e3789…88fe1`](https://www.oklink.com/xlayer/tx/0x087e378915fc84f4b463f49eb92951dc7ff7f0f39f12a2a10320582a5be88fe1) |
| Keeper (plays matches; permissionless) | [`0xB9d86f9C3b1911f4C98d68299C7C1E0082970021`](https://www.oklink.com/xlayer/address/0xB9d86f9C3b1911f4C98d68299C7C1E0082970021) |

Taped-out circuits at launch: the five house bots, circuits #1–#5 (Cautious, Lookahead, Hunter, Coward, Weaver), all refereed against each other on-chain. Season 1 entries close **2026-10-11 18:00 UTC**. Every circuit after #5 is a player's.

## Why this exists

TapeOut lets a chain carry verifiable tools of production: transistors are tokens, and a circuit is a permanent netlist anyone can evaluate. Most processors so far host one or two circuits taped out by their own team. NAND Arena gives circuits a job and gives strangers a reason to tape them out:

- **Every entry is a real tape-out** on the Arena processor, by the player, burning Arena transistors.
- **The circuit is the competitor.** The 8 sensor bits go in, 2 steering bits come out, LATCH bits are the bot's memory. No off-chain logic decides anything.
- **The chain is the referee.** `playMatch` is permissionless and deterministic; replays in the browser are bit-identical to the contract.

## The game

16 × 16 board, bots start mirrored. Every tick each bot reads:

| bit | input | meaning |
|---|---|---|
| 0 | `F` | blocked ahead |
| 1 | `L` | blocked left |
| 2 | `R` | blocked right |
| 3 | `F2` | blocked two cells ahead |
| 4 | `OL` | opponent is on my left |
| 5 | `OF` | opponent is ahead of me |
| 6 | `RL` | more open road to my left than my right |
| 7 | `COIN` | fair coin, `keccak256(season, circuitA, circuitB)` bit `2·tick + side` |

and outputs `left` (bit 0) / `right` (bit 1); neither or both = straight. Both bots move at once; leaving the board, hitting a trail, or meeting head-on is a crash. One crash loses, two is a draw, 128 ticks is a draw.

Bots are written in a tiny language and compiled to NAND/LATCH in the browser:

```
mem lastLeft                       # one LATCH of memory
let free  = !F & !F2
let weave = free & COIN
let goL = (F & RL) | (weave & !lastLeft & !L)
let goR = (F & !RL) | (weave & lastLeft & !R)
left  = goL
right = goR & !goL
next lastLeft = (lastLeft & !goR) | goL
```

## Seasons, prizes and the asset

| Term | Value |
|---|---|
| Transistor supply | **2,097,152** (NAND + LATCH combined), hard cap, immutable |
| Unit price | **0.0001 OKB** per transistor, immutable |
| Per-wallet cap | none at mint; 3 entries per wallet per season |
| Processor creator | the `NandArena` contract |
| Mint income split | **70%** current season pool · **20%** next season · **10%** ops (keeper gas), by code in `sweep()` |

All of this is written into the processor's on-chain `story` at deployment.

- Round robin, win 3 / draw 1. Ties: wins, then **fewer gates**, then earlier entry, so copying a champion never beats it.
- Top three player bots split the pool **50 / 30 / 20**. House bots (deployed by the ops address) play every match but are never eligible for prizes.
- Prizes are paid to the **current holder of the circuit NFT**, so a winning bot is a tradeable asset.
- `finalize()` is permissionless and opens the next season (7-day entry window) with the carry pool.
- Every tape-out burns transistors and supply never refills, so silicon gets scarcer as the league is played.

## Contracts

`contracts/src/`

- **`NandArena.sol`**: creates the processor through the TapeOut factory in its constructor (so it is `creator()` and receives mint income), runs seasons, `buildAndEnter` (mint exact transistors → `tapeout` → enter → transfer the circuit NFT to the player, one transaction), `playMatch`, `finalize`, `claim`, `simulate` (free sparring for any two Arena circuits) and `crossCheck`.
- **`ArenaVM.sol`**: a gas-lean evaluator for native NAND/LATCH netlists with exactly the semantics of TapeOut's `NetlistVM.run`. A protocol `step()` call costs ~40k + 2.35k gas per gate; ArenaVM runs a full 128-tick match between two bots in 0.4–4M gas (< $0.01), which is what makes an on-chain round robin affordable.
- **`LightCycles.sol`**: the game, mirrored by `sdk/game.js`.

### Security notes

- No owner. No function moves pooled OKB except to prize winners; the ops address only receives its fixed 10%.
- TapeOut's factory and beacons are upgradeable. Each bot's netlist hash is snapshotted at entry; if a netlist ever changes or can't be read, that bot **forfeits** rather than jamming the season.
- `ArenaVM` is fuzz-tested against the live protocol `step()` on an X Layer fork, and anyone can compare them for any circuit on-chain with `crossCheck(circuitId, state, inputs)`.
- Pull payments, state updated before transfers, bounded loops (≤ 64 entries), REF elements rejected (Arena bots must be native silicon so the gate cap and burn are real).

## Repo layout

```
contracts/   Foundry project (NandArena, ArenaVM, LightCycles, tests on an X Layer fork)
sdk/         netlist codec, bit-exact VM, game engine, bot language compiler, house bots
web/         Vite + React app: Arena, replay viewer, Bot Lab
scripts/     deploy.mjs (mainnet + fork rehearsal), keeper.mjs (plays matches, finalizes, pushes prizes)
deployments/ addresses and house-bot records
```

## Run it

```bash
npm install && (cd web && npm install)
node sdk/test/sdk.test.mjs                       # compiler fuzz + round robin
node sdk/test/fixture.mjs                        # JS engine results for the contract test
cd contracts && forge test                       # forks X Layer mainnet
cd web && VITE_NETWORK=xlayer npm run dev
```

## Verification

- `test_houseBotsMatchJsEngine`: every house-bot match result and tick count from the contract equals the JS engine.
- `testFuzz_arenaVmMatchesTapeOut`: random NAND/LATCH netlists (with forward LATCH feedback) taped out on the real processor; ArenaVM equals TapeOut `step()` beat for beat.
- The replay page re-runs any match through `NandArena.simulate()` with one click.

## License

MIT

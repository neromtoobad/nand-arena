// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITapeOutFactory, ITransistors, ICircuits} from "./ITapeOut.sol";
import {ArenaVM} from "./ArenaVM.sol";
import {LightCycles} from "./LightCycles.sol";

/// @title NAND Arena — a hardware bot league on TapeOut × X Layer.
/// @notice Every bot is a NAND/LATCH circuit taped out on the Arena processor (this contract is
///         the processor's creator). Seasons are round robins refereed on-chain: anyone can call
///         playMatch, results are deterministic, and prizes go to whoever holds the bot's circuit
///         NFT. Mint income from the Arena transistors is split by code: 70% to the current season
///         prize pool, 20% to the next season, 10% to ops (keeper gas). There is no owner and no
///         function that moves pooled funds anywhere except to prize winners.
contract NandArena {
    using ArenaVM for ArenaVM.Prog;

    // ---------------------------------------------------------------- processor terms (disclosed in STORY)
    ITapeOutFactory public constant FACTORY = ITapeOutFactory(0x1f09DAeFA827f02CBb40967cc91b259763760761);
    string public constant NAME = "NAND Arena";
    string public constant SYMBOL = "ARENA";
    uint256 public constant SUPPLY = 2_097_152;          // 2^21 transistors, NAND+LATCH combined, fixed forever
    uint256 public constant PRICE = 0.0001 ether;        // per transistor, fixed forever
    string public constant STORY =
        "NAND Arena: a hardware bot league. Every bot is a circuit taped out here and refereed on-chain. "
        "Supply cap 2,097,152 transistors (NAND+LATCH), price 0.0001 OKB each, both immutable; no per-wallet mint cap. "
        "Creator is the NandArena contract: mint income splits 70% season prize pool / 20% next season / 10% ops, by code.";

    // ---------------------------------------------------------------- league rules
    uint256 public constant POOL_BPS = 7000;
    uint256 public constant CARRY_BPS = 2000;            // ops gets the remaining 1000
    uint32 public constant N_IN = 8;
    uint32 public constant N_OUT = 2;
    uint32 public constant GATE_CAP = 256;
    uint32 public constant STATE_CAP = 32;
    uint256 public constant MAX_ENTRIES = 64;
    uint256 public constant MAX_PER_WALLET = 3;
    uint256 public constant SEASON_LENGTH = 7 days;      // entry window of auto-opened seasons
    uint256 public constant FIRST_BPS = 5000;
    uint256 public constant SECOND_BPS = 3000;
    uint256 public constant THIRD_BPS = 2000;

    ITransistors public immutable transistors;
    ICircuits public immutable processor;
    address public immutable ops;                        // deploys the house bots; they never win prizes

    struct Season {
        uint64 entryClose;
        uint32 nEntries;
        uint32 played;
        bool finalized;
        uint256 pool;
    }

    struct Entry {
        uint64 circuitId;
        address entrant;
        uint32 gates;
        uint16 points;
        uint8 wins;
        uint8 draws;
        uint8 losses;
        bytes32 nlHash;                                  // netlist snapshot: matches fail closed if it ever changes
    }

    uint256 public currentSeason;
    uint256 public carry;                                // next season's seed
    uint256 public opsOwed;
    mapping(uint256 => Season) public seasons;
    mapping(uint256 => Entry[]) internal _entries;
    mapping(uint256 => mapping(uint256 => uint8)) public pairResult;  // a*64+b (a<b): 0 unplayed, 1 draw, 2 A won, 3 B won
    mapping(uint256 => mapping(uint64 => bool)) public circuitEntered;
    mapping(uint256 => mapping(address => uint256)) public walletEntries;
    mapping(uint256 => uint256[3]) internal _podium;                 // entry index + 1, 0 = empty
    mapping(uint256 => mapping(uint256 => uint256)) public prizeOf;  // season => entry => OKB owed

    event Entered(uint256 indexed season, uint256 indexed entry, uint64 indexed circuitId, address entrant, uint32 gates);
    event MatchPlayed(uint256 indexed season, uint256 indexed a, uint256 indexed b, uint8 result, uint256 ticks);
    event Finalized(uint256 indexed season, uint256 pool, uint256[3] podium, uint256[3] prizes);
    event SeasonOpened(uint256 indexed season, uint64 entryClose, uint256 pool);
    event Swept(uint256 amount, uint256 toPool, uint256 toCarry, uint256 toOps);
    event Donated(uint256 indexed season, address indexed from, uint256 amount);
    event PrizePaid(uint256 indexed season, uint256 indexed entry, address to, uint256 amount);

    constructor(uint64 firstEntryClose) payable {
        require(firstEntryClose > block.timestamp, "close in past");
        require(msg.value == FACTORY.deployFee(), "deploy fee");
        (address t, address c) = FACTORY.createCPU{value: msg.value}(NAME, SYMBOL, STORY, SUPPLY, PRICE);
        transistors = ITransistors(t);
        processor = ICircuits(c);
        ops = msg.sender;
        currentSeason = 1;
        seasons[1].entryClose = firstEntryClose;
        emit SeasonOpened(1, firstEntryClose, 0);
    }

    // ---------------------------------------------------------------- money in

    receive() external payable {
        if (msg.sender == address(transistors)) return;  // mint income, accounted in sweep()
        _donate();
    }

    function donate() external payable { _donate(); }

    function _donate() internal {
        seasons[currentSeason].pool += msg.value;
        emit Donated(currentSeason, msg.sender, msg.value);
    }

    /// @notice Pull mint income from the Transistors contract and split it by the fixed rule.
    function sweep() public {
        if (transistors.owed(address(this)) == 0) return;
        uint256 before = address(this).balance;
        transistors.withdraw();
        uint256 got = address(this).balance - before;
        uint256 toPool = (got * POOL_BPS) / 10_000;
        uint256 toCarry = (got * CARRY_BPS) / 10_000;
        uint256 toOps = got - toPool - toCarry;
        seasons[currentSeason].pool += toPool;
        carry += toCarry;
        opsOwed += toOps;
        emit Swept(got, toPool, toCarry, toOps);
    }

    // ---------------------------------------------------------------- entering

    /// @notice Enter a bot you already taped out on the Arena processor.
    function enter(uint64 circuitId) external returns (uint256 idx) {
        require(processor.ownerOf(circuitId) == msg.sender, "not your circuit");
        return _enter(circuitId, msg.sender);
    }

    /// @notice One transaction: mint exactly the transistors the netlist burns, tape it out on the
    ///         Arena processor, enter it in the current season and hand you the circuit NFT.
    /// @dev    msg.value must equal quoteBuild(nl).
    function buildAndEnter(bytes calldata nl) external payable returns (uint64 circuitId, uint256 idx) {
        (uint256 nNand, uint256 nLatch) = ArenaVM.count(nl);
        require(msg.value == quoteBuild(nl), "wrong value");
        uint256 pf = transistors.protocolFee();
        if (nNand > 0) transistors.mint{value: PRICE * nNand + pf}(0, nNand);
        if (nLatch > 0) transistors.mint{value: PRICE * nLatch + pf}(1, nLatch);
        circuitId = uint64(processor.tapeout{value: processor.TAPEOUT_FEE()}(nl, N_IN, N_OUT));
        idx = _enter(circuitId, msg.sender);
        IERC721Min(address(processor)).transferFrom(address(this), msg.sender, circuitId);
        sweep();
    }

    function quoteBuild(bytes calldata nl) public view returns (uint256) {
        (uint256 nNand, uint256 nLatch) = ArenaVM.count(nl);
        uint256 pf = transistors.protocolFee();
        return PRICE * (nNand + nLatch) + (nNand > 0 ? pf : 0) + (nLatch > 0 ? pf : 0) + processor.TAPEOUT_FEE();
    }

    function _enter(uint64 circuitId, address entrant) internal returns (uint256 idx) {
        uint256 s = currentSeason;
        Season storage S = seasons[s];
        require(!S.finalized && block.timestamp < S.entryClose, "entries closed");
        require(S.nEntries < MAX_ENTRIES, "season full");
        require(!circuitEntered[s][circuitId], "already entered");
        if (entrant != ops) require(walletEntries[s][entrant] < MAX_PER_WALLET, "wallet limit");
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gates) = processor.circuitInfo(circuitId);
        require(nIn == N_IN && nOut == N_OUT, "bot needs 8 inputs, 2 outputs");
        require(gates <= GATE_CAP && nState <= STATE_CAP, "bot too big");
        bytes memory nl = processor.netlist(circuitId);
        (uint256 nNand, uint256 nLatch) = ArenaVM.count(nl);
        require(nNand + nLatch == gates, "netlist mismatch");

        circuitEntered[s][circuitId] = true;
        walletEntries[s][entrant] += 1;
        idx = S.nEntries;
        S.nEntries += 1;
        _entries[s].push(Entry({
            circuitId: circuitId, entrant: entrant, gates: gates,
            points: 0, wins: 0, draws: 0, losses: 0, nlHash: keccak256(nl)
        }));
        emit Entered(s, idx, circuitId, entrant, gates);
    }

    // ---------------------------------------------------------------- matches

    function matchSeed(uint256 season, uint64 circuitA, uint64 circuitB) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(uint32(season), circuitA, circuitB)));
    }

    function _prog(uint64 circuitId) internal view returns (ArenaVM.Prog memory) {
        return ArenaVM.load(processor.netlist(circuitId), N_IN, N_OUT);
    }

    /// @dev Loads an entered bot; ok = false if its netlist can no longer be read or no longer
    ///      matches the snapshot taken at entry (e.g. a protocol upgrade). That bot forfeits.
    function _entryProg(Entry storage e) internal view returns (bool ok, ArenaVM.Prog memory pr) {
        try processor.netlist(e.circuitId) returns (bytes memory nl) {
            if (keccak256(nl) != e.nlHash) return (false, pr);
            return (true, ArenaVM.load(nl, N_IN, N_OUT));
        } catch {
            return (false, pr);
        }
    }

    /// @notice Play the round-robin match between entries a and b of the current season. Anyone can call.
    function playMatch(uint256 a, uint256 b) public returns (uint8 result, uint256 ticks) {
        uint256 s = currentSeason;
        Season storage S = seasons[s];
        require(!S.finalized, "finalized");
        require(a < b && b < S.nEntries, "bad pair");
        uint256 key = a * MAX_ENTRIES + b;
        require(pairResult[s][key] == 0, "played");
        Entry storage ea = _entries[s][a];
        Entry storage eb = _entries[s][b];
        (bool okA, ArenaVM.Prog memory pa) = _entryProg(ea);
        (bool okB, ArenaVM.Prog memory pb) = _entryProg(eb);
        if (okA && okB) {
            (result, ticks) = LightCycles.play(pa, pb, matchSeed(s, ea.circuitId, eb.circuitId));
        } else {
            result = okA ? LightCycles.A_WINS : (okB ? LightCycles.B_WINS : LightCycles.DRAW);   // forfeit
        }
        pairResult[s][key] = result + 1;
        S.played += 1;
        if (result == LightCycles.DRAW) {
            ea.points += 1; eb.points += 1; ea.draws += 1; eb.draws += 1;
        } else if (result == LightCycles.A_WINS) {
            ea.points += 3; ea.wins += 1; eb.losses += 1;
        } else {
            eb.points += 3; eb.wins += 1; ea.losses += 1;
        }
        emit MatchPlayed(s, a, b, result, ticks);
    }

    /// @notice Play many pairs; already-played pairs are skipped.
    function playMatches(uint256[] calldata as_, uint256[] calldata bs) external {
        require(as_.length == bs.length, "len");
        uint256 s = currentSeason;
        for (uint256 i = 0; i < as_.length; i++) {
            if (pairResult[s][as_[i] * MAX_ENTRIES + bs[i]] == 0) playMatch(as_[i], bs[i]);
        }
    }

    /// @notice Free sparring: play any two circuits on the Arena processor, entered or not.
    function simulate(uint64 circuitA, uint64 circuitB, uint256 season) external view returns (uint8 result, uint256 ticks) {
        _checkBot(circuitA);
        _checkBot(circuitB);
        return LightCycles.play(_prog(circuitA), _prog(circuitB), matchSeed(season, circuitA, circuitB));
    }

    function _checkBot(uint64 circuitId) internal view {
        (uint32 nIn, uint32 nOut,,) = processor.circuitInfo(circuitId);
        require(nIn == N_IN && nOut == N_OUT, "bot needs 8 inputs, 2 outputs");
    }

    /// @notice Compare ArenaVM with the TapeOut protocol's own step() for one beat of a circuit.
    function crossCheck(uint64 circuitId, uint256 state, uint8 inputs)
        external view returns (bool same, uint256 arenaState, uint256 arenaOut, bytes memory tapeoutState, bytes memory tapeoutOut)
    {
        (uint32 nIn, uint32 nOut, uint32 nState,) = processor.circuitInfo(circuitId);
        ArenaVM.Prog memory pr = ArenaVM.load(processor.netlist(circuitId), nIn, nOut);
        (arenaState, arenaOut) = pr.step(state, inputs);
        bytes memory st = new bytes((uint256(nState) + 7) / 8);
        for (uint256 i = 0; i < st.length; i++) st[i] = bytes1(uint8(state >> (8 * i)));
        (tapeoutState, tapeoutOut) = processor.step(circuitId, st, abi.encodePacked(inputs));
        uint256 ts;
        for (uint256 i = 0; i < tapeoutState.length; i++) ts |= uint256(uint8(tapeoutState[i])) << (8 * i);
        uint256 to;
        for (uint256 i = 0; i < tapeoutOut.length; i++) to |= uint256(uint8(tapeoutOut[i])) << (8 * i);
        same = ts == arenaState && to == arenaOut;
    }

    // ---------------------------------------------------------------- season end

    function _better(Entry storage x, uint256 xi, Entry storage y, uint256 yi) internal view returns (bool) {
        if (x.points != y.points) return x.points > y.points;
        if (x.wins != y.wins) return x.wins > y.wins;
        if (x.gates != y.gates) return x.gates < y.gates;   // smaller silicon wins ties
        return xi < yi;                                     // then the earlier entry
    }

    /// @notice Close the season once entries are closed and every pair has played. Anyone can call.
    ///         Places 1-3 (house bots excluded) get 50/30/20% of the pool; unfilled places roll over.
    function finalize() external {
        sweep();
        uint256 s = currentSeason;
        Season storage S = seasons[s];
        require(!S.finalized, "finalized");
        require(block.timestamp >= S.entryClose, "entries open");
        uint256 n = S.nEntries;
        require(S.played == (n * (n - (n > 0 ? 1 : 0))) / 2, "matches left");

        Entry[] storage es = _entries[s];
        uint256[3] memory podium;
        for (uint256 place = 0; place < 3; place++) {
            uint256 best = type(uint256).max;
            for (uint256 i = 0; i < n; i++) {
                if (es[i].entrant == ops) continue;
                if (place > 0 && podium[0] == i + 1) continue;
                if (place > 1 && podium[1] == i + 1) continue;
                if (best == type(uint256).max || _better(es[i], i, es[best], best)) best = i;
            }
            if (best != type(uint256).max) podium[place] = best + 1;
        }
        uint256 pool = S.pool;
        uint256[3] memory bps = [FIRST_BPS, SECOND_BPS, THIRD_BPS];
        uint256[3] memory prizes;
        uint256 paid;
        for (uint256 place = 0; place < 3; place++) {
            if (podium[place] == 0) continue;
            prizes[place] = (pool * bps[place]) / 10_000;
            prizeOf[s][podium[place] - 1] = prizes[place];
            paid += prizes[place];
        }
        _podium[s] = podium;
        S.finalized = true;
        emit Finalized(s, pool, podium, prizes);

        uint256 next = s + 1;
        currentSeason = next;
        uint64 close = uint64(block.timestamp + SEASON_LENGTH);
        seasons[next].entryClose = close;
        seasons[next].pool = carry + (pool - paid);
        carry = 0;
        emit SeasonOpened(next, close, seasons[next].pool);
    }

    /// @notice Pay a prize to whoever holds the winning bot's circuit NFT now. Anyone can call.
    function claim(uint256 season, uint256 entry) external {
        uint256 amt = prizeOf[season][entry];
        require(amt > 0, "nothing to claim");
        prizeOf[season][entry] = 0;
        address to = processor.ownerOf(_entries[season][entry].circuitId);
        (bool ok,) = to.call{value: amt}("");
        require(ok, "pay failed");
        emit PrizePaid(season, entry, to, amt);
    }

    function withdrawOps() external {
        uint256 amt = opsOwed;
        opsOwed = 0;
        (bool ok,) = ops.call{value: amt}("");
        require(ok, "pay failed");
    }

    // ---------------------------------------------------------------- views

    function entries(uint256 season) external view returns (Entry[] memory) { return _entries[season]; }

    function podium(uint256 season) external view returns (uint256[3] memory) { return _podium[season]; }

    function matchesLeft(uint256 season) external view returns (uint256) {
        uint256 n = seasons[season].nEntries;
        return (n * (n - (n > 0 ? 1 : 0))) / 2 - seasons[season].played;
    }

    // ---------------------------------------------------------------- token receivers

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}

interface IERC721Min {
    function transferFrom(address from, address to, uint256 id) external;
}

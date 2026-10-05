// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {NandArena} from "../src/NandArena.sol";
import {ITapeOutFactory, ITransistors, ICircuits} from "../src/ITapeOut.sol";

/// Runs against a fork of X Layer mainnet: the real TapeOut factory, transistors and circuits.
contract NandArenaTest is Test {
    ITapeOutFactory constant FACTORY = ITapeOutFactory(0x1f09DAeFA827f02CBb40967cc91b259763760761);
    NandArena arena;
    ITransistors t;
    ICircuits c;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    string fixture;

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    receive() external payable {}

    function setUp() public {
        vm.createSelectFork("xlayer");
        vm.deal(address(this), 100 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        arena = new NandArena{value: FACTORY.deployFee()}(uint64(block.timestamp + 3 days));
        t = arena.transistors();
        c = arena.processor();
        fixture = vm.readFile("test/fixtures/seed.json");
    }

    function _netlists() internal view returns (bytes[] memory) {
        return vm.parseJsonBytesArray(fixture, ".netlists");
    }

    function _enterHouseBots() internal returns (uint64[] memory ids) {
        bytes[] memory nls = _netlists();
        ids = new uint64[](nls.length);
        for (uint256 i = 0; i < nls.length; i++) {
            (ids[i],) = arena.buildAndEnter{value: arena.quoteBuild(nls[i])}(nls[i]);
        }
    }

    function test_processorTermsDisclosed() public view {
        assertTrue(FACTORY.isCPU(address(c)));
        assertEq(t.creator(), address(arena));
        assertEq(t.supplyCap(), 2_097_152);
        assertEq(t.mintPrice(), 0.0001 ether);
    }

    function test_houseBotsMatchJsEngine() public {
        uint64[] memory ids = _enterHouseBots();
        for (uint256 i = 0; i < ids.length; i++) assertEq(ids[i], i + 1);
        uint256[] memory pa = vm.parseJsonUintArray(fixture, ".pairA");
        uint256[] memory pb = vm.parseJsonUintArray(fixture, ".pairB");
        uint256[] memory res = vm.parseJsonUintArray(fixture, ".results");
        uint256[] memory ticks = vm.parseJsonUintArray(fixture, ".ticks");
        for (uint256 k = 0; k < pa.length; k++) {
            uint256 g0 = gasleft();
            (uint8 r, uint256 tk) = arena.playMatch(pa[k], pb[k]);
            uint256 used = g0 - gasleft();
            emit log_named_uint(string.concat("match ", vm.toString(pa[k]), "-", vm.toString(pb[k]), " ticks ", vm.toString(tk), " gas"), used);
            assertEq(r, res[k], "result differs from JS");
            assertEq(tk, ticks[k], "ticks differ from JS");
        }
        assertEq(arena.matchesLeft(1), 0);
    }

    function test_buildAndEnterHandsNftAndFundsPool() public {
        bytes[] memory nls = _netlists();
        uint256 q = arena.quoteBuild(nls[1]);
        vm.prank(alice);
        (uint64 id, uint256 idx) = arena.buildAndEnter{value: q}(nls[1]);
        assertEq(c.ownerOf(id), alice);
        assertEq(idx, 0);
        (,,,, uint256 pool) = arena.seasons(1);
        uint256 gates = vm.parseJsonUintArray(fixture, ".gates")[1];
        assertEq(pool, (gates * 0.0001 ether * 7000) / 10_000);
        assertEq(arena.carry(), (gates * 0.0001 ether * 2000) / 10_000);
    }

    function test_walletLimitAndDuplicate() public {
        bytes[] memory nls = _netlists();
        uint256[4] memory q;
        for (uint256 i = 0; i < 4; i++) q[i] = arena.quoteBuild(nls[i]);
        vm.startPrank(alice);
        for (uint256 i = 0; i < 3; i++) arena.buildAndEnter{value: q[i]}(nls[i]);
        vm.expectRevert(bytes("wallet limit"));
        arena.buildAndEnter{value: q[3]}(nls[3]);
        vm.stopPrank();
    }

    function test_enterExternallyTapedOut() public {
        bytes memory nl = _netlists()[0];
        vm.startPrank(bob);
        t.mint{value: 0.0001 ether * 5 + t.protocolFee()}(0, 5);
        uint256 id = c.tapeout{value: c.TAPEOUT_FEE()}(nl, 8, 2);
        arena.enter(uint64(id));
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(bytes("not your circuit"));
        arena.enter(uint64(id));
    }

    function test_seasonLifecycleAndPrizes() public {
        _enterHouseBots();                        // 5 house bots: never win prizes
        bytes[] memory nls = _netlists();
        uint256 q0 = arena.quoteBuild(nls[0]);
        uint256 q4 = arena.quoteBuild(nls[4]);
        vm.prank(alice);
        arena.buildAndEnter{value: q0}(nls[0]);   // idx 5
        vm.prank(bob);
        arena.buildAndEnter{value: q4}(nls[4]);   // idx 6
        arena.donate{value: 1 ether}();

        vm.expectRevert(bytes("entries open"));
        arena.finalize();
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(bytes("matches left"));
        arena.finalize();
        for (uint256 a = 0; a < 7; a++) for (uint256 b = a + 1; b < 7; b++) arena.playMatch(a, b);
        (,,,, uint256 pool) = arena.seasons(1);
        uint256 carryBefore = arena.carry();
        arena.finalize();

        uint256[3] memory pod = arena.podium(1);
        assertTrue(pod[0] == 6 || pod[0] == 7);   // alice or bob, never a house bot
        assertTrue(pod[1] == 6 || pod[1] == 7);
        assertEq(pod[2], 0);                      // only two eligible entries
        assertEq(arena.currentSeason(), 2);
        (,,,, uint256 pool2) = arena.seasons(2);
        uint256 paid = (pool * 5000) / 10_000 + (pool * 3000) / 10_000;
        assertEq(pool2, carryBefore + pool - paid);

        address winner = pod[0] == 6 ? alice : bob;
        uint256 before = winner.balance;
        arena.claim(1, pod[0] - 1);
        assertEq(winner.balance - before, (pool * 5000) / 10_000);
        vm.expectRevert(bytes("nothing to claim"));
        arena.claim(1, pod[0] - 1);
    }

    function test_prizeFollowsNft() public {
        bytes[] memory nls = _netlists();
        uint256 q = arena.quoteBuild(nls[0]);
        vm.prank(alice);
        (uint64 id,) = arena.buildAndEnter{value: q}(nls[0]);
        arena.donate{value: 1 ether}();
        vm.warp(block.timestamp + 3 days);
        arena.finalize();
        vm.prank(alice);
        IERC721T(address(c)).transferFrom(alice, bob, id);
        uint256 before = bob.balance;
        arena.claim(1, 0);
        assertGt(bob.balance, before);
    }

    function test_changedNetlistForfeitsInsteadOfBlockingSeason() public {
        uint64[] memory ids = _enterHouseBots();
        // Simulate a protocol upgrade that alters bot #2's netlist: it must forfeit, not revert.
        vm.mockCall(address(c), abi.encodeWithSelector(ICircuits.netlist.selector, uint256(ids[1])), abi.encode(_netlists()[0]));
        (uint8 r, uint256 tk) = arena.playMatch(0, 1);
        assertEq(r, 1);
        assertEq(tk, 0);
        vm.mockCallRevert(address(c), abi.encodeWithSelector(ICircuits.netlist.selector, uint256(ids[2])), "gone");
        (r,) = arena.playMatch(1, 2);
        assertEq(r, 0);   // both unavailable: draw
    }

    // ---------------------------------------------------------------- ArenaVM == TapeOut step()

    function _randomNetlist(uint256 seed, uint256 nGates, uint256 nLatch) internal pure returns (bytes memory nl) {
        uint256 base = 10;
        uint256 total = base + nLatch + nGates;
        for (uint256 i = 0; i < nLatch; i++) {
            uint256 d = uint256(keccak256(abi.encode(seed, "d", i))) % total;   // may point forward
            nl = bytes.concat(nl, bytes1(0x01), bytes3(uint24(d)));
        }
        for (uint256 j = 0; j < nGates; j++) {
            uint256 s = base + nLatch + j;
            uint256 a = uint256(keccak256(abi.encode(seed, "a", j))) % s;
            uint256 b = uint256(keccak256(abi.encode(seed, "b", j))) % s;
            nl = bytes.concat(nl, bytes1(0x00), bytes3(uint24(a)), bytes3(uint24(b)));
        }
    }

    function testFuzz_arenaVmMatchesTapeOut(uint256 seed) public {
        uint256 nGates = 2 + (seed % 60);
        uint256 nLatch = (seed >> 8) % 9;
        bytes memory nl = _randomNetlist(seed, nGates, nLatch);
        t.mint{value: 0.0001 ether * nGates + t.protocolFee()}(0, nGates);
        if (nLatch > 0) t.mint{value: 0.0001 ether * nLatch + t.protocolFee()}(1, nLatch);
        uint64 id = uint64(c.tapeout{value: c.TAPEOUT_FEE()}(nl, 8, 2));
        uint256 state = 0;
        for (uint256 beat = 0; beat < 12; beat++) {
            uint8 inp = uint8(uint256(keccak256(abi.encode(seed, beat))));
            (bool same, uint256 st,,,) = arena.crossCheck(id, state, inp);
            assertTrue(same, "ArenaVM diverged from TapeOut step()");
            state = st;
        }
    }
}

interface IERC721T {
    function transferFrom(address from, address to, uint256 id) external;
}

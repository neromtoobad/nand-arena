// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ITapeOutFactory, ITransistors, ICircuits} from "../src/ITapeOut.sol";

contract GasProbe is Test {
    ITapeOutFactory constant FACTORY = ITapeOutFactory(0x1f09DAeFA827f02CBb40967cc91b259763760761);
    ITransistors t;
    ICircuits c;

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function setUp() public {
        vm.createSelectFork("xlayer");
        vm.deal(address(this), 10 ether);
        (address tr, address ci) = FACTORY.createCPU{value: FACTORY.deployFee()}("Probe", "PRB", "probe", 1 << 21, 0.0001 ether);
        t = ITransistors(tr);
        c = ICircuits(ci);
    }

    function _build(uint256 nGates, uint256 nLatch) internal pure returns (bytes memory nl) {
        uint256 base = 2 + 8;
        uint256 total = base + nLatch + nGates;
        for (uint256 i = 0; i < nLatch; i++) {
            uint256 d = base + nLatch + ((i * 7 + 3) % nGates);
            nl = bytes.concat(nl, bytes1(0x01), bytes3(uint24(d)));
        }
        for (uint256 j = 0; j < nGates; j++) {
            uint256 s = base + nLatch + j;
            uint256 a = uint256(keccak256(abi.encode(j, 1))) % s;
            uint256 b = uint256(keccak256(abi.encode(j, 2))) % s;
            nl = bytes.concat(nl, bytes1(0x00), bytes3(uint24(a)), bytes3(uint24(b)));
        }
        require(total > 0);
    }

    function _probe(uint256 nGates, uint256 nLatch) internal {
        bytes memory nl = _build(nGates, nLatch);
        t.mint{value: t.mintPrice() * nGates + t.protocolFee()}(0, nGates);
        if (nLatch > 0) t.mint{value: t.mintPrice() * nLatch + t.protocolFee()}(1, nLatch);
        uint256 g0 = gasleft();
        uint256 id = c.tapeout{value: c.TAPEOUT_FEE()}(nl, 8, 2);
        uint256 tapeGas = g0 - gasleft();
        bytes memory st = new bytes((nLatch + 7) / 8);
        // warm-ish: first call cold, then repeated
        g0 = gasleft();
        (st,) = c.step(id, st, hex"5a");
        uint256 first = g0 - gasleft();
        g0 = gasleft();
        for (uint256 k = 0; k < 10; k++) (st,) = c.step(id, st, abi.encodePacked(uint8(k * 37)));
        uint256 avg = (g0 - gasleft()) / 10;
        emit log_named_uint("gates", nGates);
        emit log_named_uint("  tapeout gas", tapeGas);
        emit log_named_uint("  step gas (cold)", first);
        emit log_named_uint("  step gas (warm avg)", avg);
    }

    function test_probe() public {
        _probe(48, 4);
        _probe(96, 6);
        _probe(160, 8);
    }
}

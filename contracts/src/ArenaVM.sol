// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArenaVM — gas-lean evaluator for native NAND/LATCH TapeOut netlists.
/// @notice Same semantics as TapeOut's NetlistVM.run (TAP-02) for netlists without REF:
///         signals 0/1 = constants, 2..2+nIn-1 = inputs (LSB-first), one signal per record;
///         a LATCH outputs its previous-beat state bit and its new bit is signal[d] after
///         every record has been computed; outputs are the last nOut signals.
///         Equivalence with the live protocol `step()` is fuzz-tested on an X Layer fork and
///         can be checked by anyone on-chain through NandArena.crossCheck().
library ArenaVM {
    struct Prog {
        bytes nl;          // raw netlist (as stored by the TapeOut processor)
        uint256 nSignals;  // 2 + nIn + records
        uint256 nIn;
        uint256 nOut;
        bytes sig;         // scratch: one byte per signal, reused every beat
        uint256[] latchD;  // d of each LATCH, in record order
    }

    /// @dev Count NAND and LATCH records; reverts on REF or malformed netlists.
    function count(bytes memory nl) internal pure returns (uint256 nNand, uint256 nLatch) {
        uint256 p = 0;
        uint256 len = nl.length;
        while (p < len) {
            uint8 op = uint8(nl[p]);
            if (op == 0) { nNand++; p += 7; }
            else if (op == 1) { nLatch++; p += 4; }
            else revert("arena: native NAND/LATCH only");
        }
        require(p == len, "arena: truncated netlist");
    }

    function load(bytes memory nl, uint256 nIn, uint256 nOut) internal pure returns (Prog memory pr) {
        (uint256 nNand, uint256 nLatch) = count(nl);
        pr.nl = nl;
        pr.nIn = nIn;
        pr.nOut = nOut;
        pr.nSignals = 2 + nIn + nNand + nLatch;
        require(pr.nSignals >= 2 + nIn + nOut, "arena: too few signals");
        pr.sig = new bytes(pr.nSignals + 32);
        pr.latchD = new uint256[](nLatch);
        uint256 p = 0;
        uint256 k = 0;
        while (p < nl.length) {
            if (uint8(nl[p]) == 0) { p += 7; }
            else {
                uint256 d = (uint256(uint8(nl[p + 1])) << 16) | (uint256(uint8(nl[p + 2])) << 8) | uint256(uint8(nl[p + 3]));
                require(d < pr.nSignals, "arena: latch d range");
                pr.latchD[k++] = d;
                p += 4;
            }
        }
    }

    /// @notice One beat. `state` and `inputs` are LSB-first bitmaps; returns new state and outputs.
    function step(Prog memory pr, uint256 state, uint256 inputs) internal pure returns (uint256 newState, uint256 out) {
        bytes memory nl = pr.nl;
        bytes memory sigBuf = pr.sig;
        uint256 nIn = pr.nIn;
        assembly {
            let sig := add(sigBuf, 32)
            mstore8(sig, 0)
            mstore8(add(sig, 1), 1)
            for { let i := 0 } lt(i, nIn) { i := add(i, 1) } {
                mstore8(add(sig, add(2, i)), and(shr(i, inputs), 1))
            }
            let p := add(nl, 32)
            let end := add(p, mload(nl))
            let pos := add(sig, add(2, nIn))
            let li := 0
            for {} lt(p, end) {} {
                let w := mload(p)
                switch byte(0, w)
                case 0 {
                    let va := byte(0, mload(add(sig, and(shr(224, w), 0xffffff))))
                    let vb := byte(0, mload(add(sig, and(shr(200, w), 0xffffff))))
                    mstore8(pos, iszero(and(va, vb)))
                    p := add(p, 7)
                }
                default {
                    mstore8(pos, and(shr(li, state), 1))
                    li := add(li, 1)
                    p := add(p, 4)
                }
                pos := add(pos, 1)
            }
        }
        uint256[] memory ds = pr.latchD;
        for (uint256 k = 0; k < ds.length; k++) {
            if (uint8(sigBuf[ds[k]]) == 1) newState |= (1 << k);
        }
        uint256 base = pr.nSignals - pr.nOut;
        for (uint256 i = 0; i < pr.nOut; i++) {
            if (uint8(sigBuf[base + i]) == 1) out |= (1 << i);
        }
    }
}

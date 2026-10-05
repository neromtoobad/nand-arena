// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArenaVM} from "./ArenaVM.sol";

/// @title LightCycles — the Season 1 game, refereed entirely on-chain.
/// @notice Mirrors sdk/game.js exactly (tests compare the two). 16x16 board, both bots move at
///         once; leaving the board, hitting any trail or meeting head-on is a crash.
library LightCycles {
    using ArenaVM for ArenaVM.Prog;

    uint256 internal constant SIZE = 16;
    uint256 internal constant MAX_TICKS = 128;
    uint8 internal constant DRAW = 0;
    uint8 internal constant A_WINS = 1;
    uint8 internal constant B_WINS = 2;

    struct Bot { int256 x; int256 y; uint256 d; uint256 state; }

    function _dx(uint256 d) private pure returns (int256) { return d == 1 ? int256(1) : (d == 3 ? int256(-1) : int256(0)); }
    function _dy(uint256 d) private pure returns (int256) { return d == 0 ? int256(-1) : (d == 2 ? int256(1) : int256(0)); }

    function _blocked(uint256 occ, int256 x, int256 y) private pure returns (bool) {
        if (x < 0 || y < 0 || x >= int256(SIZE) || y >= int256(SIZE)) return true;
        return (occ >> (uint256(y) * SIZE + uint256(x))) & 1 == 1;
    }

    function _run(uint256 occ, Bot memory me, uint256 dir) private pure returns (uint256 n) {
        int256 x = me.x + _dx(dir);
        int256 y = me.y + _dy(dir);
        while (!_blocked(occ, x, y)) { n++; x += _dx(dir); y += _dy(dir); }
    }

    /// @notice The 8 input bits a bot sees: F L R F2 OL OF RL COIN (bit 0..7).
    function sense(uint256 occ, Bot memory me, Bot memory opp, uint256 coin) internal pure returns (uint256 bits) {
        uint256 d = me.d;
        uint256 l = (d + 3) & 3;
        uint256 r = (d + 1) & 3;
        if (_blocked(occ, me.x + _dx(d), me.y + _dy(d))) bits |= 1;
        if (_blocked(occ, me.x + _dx(l), me.y + _dy(l))) bits |= 2;
        if (_blocked(occ, me.x + _dx(r), me.y + _dy(r))) bits |= 4;
        if (_blocked(occ, me.x + 2 * _dx(d), me.y + 2 * _dy(d))) bits |= 8;
        int256 ddx = opp.x - me.x;
        int256 ddy = opp.y - me.y;
        if (ddx * _dx(l) + ddy * _dy(l) > 0) bits |= 16;
        if (ddx * _dx(d) + ddy * _dy(d) > 0) bits |= 32;
        if (_run(occ, me, l) > _run(occ, me, r)) bits |= 64;
        if (coin == 1) bits |= 128;
    }

    function _turn(uint256 d, uint256 out) private pure returns (uint256) {
        uint256 left = out & 1;
        uint256 right = (out >> 1) & 1;
        if (left == 1 && right == 0) return (d + 3) & 3;
        if (right == 1 && left == 0) return (d + 1) & 3;
        return d;
    }

    /// @return result 0 draw, 1 A wins, 2 B wins
    /// @return ticks  number of ticks played
    function play(ArenaVM.Prog memory pa, ArenaVM.Prog memory pb, uint256 seed) internal pure returns (uint8 result, uint256 ticks) {
        Bot memory a = Bot(3, 8, 1, 0);
        Bot memory b = Bot(12, 7, 3, 0);
        uint256 occ = (1 << (8 * SIZE + 3)) | (1 << (7 * SIZE + 12));
        for (uint256 t = 0; t < MAX_TICKS; t++) {
            uint256 inA = sense(occ, a, b, (seed >> (2 * t)) & 1);
            uint256 inB = sense(occ, b, a, (seed >> (2 * t + 1)) & 1);
            uint256 outA;
            uint256 outB;
            (a.state, outA) = pa.step(a.state, inA);
            (b.state, outB) = pb.step(b.state, inB);
            a.d = _turn(a.d, outA);
            b.d = _turn(b.d, outB);
            int256 ax = a.x + _dx(a.d);
            int256 ay = a.y + _dy(a.d);
            int256 bx = b.x + _dx(b.d);
            int256 by = b.y + _dy(b.d);
            bool crashA = _blocked(occ, ax, ay);
            bool crashB = _blocked(occ, bx, by);
            if (ax == bx && ay == by) { crashA = true; crashB = true; }
            if (crashA || crashB) {
                return (crashA && crashB ? DRAW : (crashA ? B_WINS : A_WINS), t + 1);
            }
            occ |= (1 << (uint256(ay) * SIZE + uint256(ax))) | (1 << (uint256(by) * SIZE + uint256(bx)));
            (a.x, a.y, b.x, b.y) = (ax, ay, bx, by);
        }
        return (DRAW, MAX_TICKS);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal interfaces for the TapeOut protocol on X Layer (chain 196).
/// Source of truth: OKLink-verified CircuitFactory / Transistors / Circuits (solc 0.8.24).

interface ITapeOutFactory {
    function createCPU(string calldata name, string calldata symbol, string calldata story, uint256 transistorSupply, uint256 mintPrice)
        external payable returns (address transistors, address circuits);
    function deployFee() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function isCPU(address) external view returns (bool);
    function circuitBeacon() external view returns (address);
}

interface ITransistors {
    function mint(uint256 id, uint256 amount) external payable;
    function mintPrice() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function supplyCap() external view returns (uint256);
    function minted() external view returns (uint256);
    function creator() external view returns (address);
    function owed(address) external view returns (uint256);
    function withdraw() external;
    function balanceOf(address, uint256) external view returns (uint256);
}

interface ICircuits {
    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256);
    function TAPEOUT_FEE() external view returns (uint256);
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function step(uint256 id, bytes calldata state, bytes calldata inputs) external view returns (bytes memory newState, bytes memory outputs);
    function circuitInfo(uint256 id) external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
    function netlist(uint256 id) external view returns (bytes memory);
    function nextId() external view returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
    function transistors() external view returns (address);
}

interface IBeacon {
    function implementation() external view returns (address);
}

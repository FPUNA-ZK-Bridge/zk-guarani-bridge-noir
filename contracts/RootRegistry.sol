// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Registro TEMPORAL de `transactions_root` confiables (MVP, Fase 1).
/// Es el "root de confianza" que la prueba BLS de finalidad del sync committee
/// reemplaza en la Fase 4 (ver docs/INTEGRACION_ZK.md §6). No usar en producción
/// como fuente de verdad definitiva.
contract RootRegistry {
    address public owner;
    mapping(bytes32 => bool) public isKnown;

    event RootAdded(bytes32 indexed root);
    event OwnerChanged(address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "RootRegistry: only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addRoot(bytes32 root) external onlyOwner {
        isKnown[root] = true;
        emit RootAdded(root);
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }
}

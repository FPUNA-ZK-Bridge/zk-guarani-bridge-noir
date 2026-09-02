// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interfaz común de los verificadores UltraHonk generados por `bb`.
/// El contrato generado se llama `HonkVerifier` y expone exactamente esta firma.
interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs)
        external
        view
        returns (bool);
}

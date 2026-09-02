// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IHonkVerifier.sol";

/// @title SignatureVerifierStub
/// @notice ⚠️ PLACEHOLDER de Fase 4 — NO verifica nada. Devuelve `true` siempre.
///
/// Representa el verificador de la firma BLS12-381 del sync committee de Ethereum
/// (circuito `zk-bridge-zero/noir-bls12-381-validator`). Ese circuito prueba, en
/// zero-knowledge, que el comité firmó el bloque (finalidad). Probarlo cuesta ~100M
/// gates (15-60+ min, mucha RAM), así que en este prototipo se STUBBEA para poder
/// mostrar el punto de integración sin correrlo.
///
/// Mantiene la MISMA interfaz (`IHonkVerifier`) que tendría el verificador real que
/// genera `bb write_solidity_verifier`, para que sea un reemplazo directo (drop-in):
/// el día que se genere el verificador BLS real, se cambia este contrato por aquél
/// sin tocar `ReceiverZKBoundBLS`.
///
/// `publicInputs` del real serían el `signing_root` del bloque firmado (32 campos).
contract SignatureVerifierStub is IHonkVerifier {
    /// @dev SIEMPRE devuelve true. Placeholder, no es una verificación real.
    function verify(bytes calldata /*proof*/, bytes32[] calldata /*publicInputs*/)
        external
        pure
        returns (bool)
    {
        return true;
    }
}

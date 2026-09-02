// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GuaraniToken.sol";
import "./verifiers/IHonkVerifier.sol";

/// @title ReceiverZKBoundBLS
/// @notice Diseño de la Fase 4 (trustless completo). Exige DOS pruebas ZK para acuñar:
///   1. MPT (`txVerifier`)  — inclusión de la tx + binding de (recipient, amount) [Fase 3].
///   2. BLS (`sigVerifier`) — firma del sync committee sobre el bloque (finalidad) [Fase 4].
///
/// Reemplaza al `RootRegistry` confiable: en vez de "confiar" en que el `txRoot` es de un
/// bloque real, lo prueba la firma BLS. En este prototipo, `sigVerifier` es un STUB
/// (`SignatureVerifierStub`) que devuelve `true` — sirve para MOSTRAR el punto de
/// integración sin correr el circuito BLS (~100M gates). El circuito BLS real existe y fue
/// probado por separado (ver `zk-bridge-zero` / `docs/INTEGRACION_ZK.md §6`).
///
/// Layout de `txPublicInputs` (del circuito Fase 3): [root 32][recipient 20][amount 32] = 84.
contract ReceiverZKBoundBLS {
    GuaraniToken  public immutable token;
    IHonkVerifier public immutable txVerifier;  // circuito MPT (inclusión + binding)
    IHonkVerifier public immutable sigVerifier; // circuito BLS (firma) — hoy STUB

    mapping(uint256 => bool) public processed;

    event Released(uint256 indexed id, address indexed to, uint256 amount);

    constructor(GuaraniToken _token, IHonkVerifier _txVerifier, IHonkVerifier _sigVerifier) {
        token = _token;
        txVerifier = _txVerifier;
        sigVerifier = _sigVerifier;
    }

    function release(
        uint256 id,
        address to,
        uint256 amount,
        bytes32 txRoot,
        bytes calldata txProof,
        bytes32[] calldata txPublicInputs,
        bytes calldata sigProof,
        bytes32[] calldata sigPublicInputs
    ) external {
        require(!processed[id], "ReceiverZKBoundBLS: replay");
        require(txPublicInputs.length == 84, "ReceiverZKBoundBLS: bad tx public inputs len");

        // ── Fase 3: inclusión + binding de (recipient, amount) ────────────────────
        require(_rootMatches(txRoot, txPublicInputs), "ReceiverZKBoundBLS: root mismatch");
        require(_recipientMatches(to, txPublicInputs), "ReceiverZKBoundBLS: recipient mismatch");
        require(_amountMatches(amount, txPublicInputs), "ReceiverZKBoundBLS: amount mismatch");
        require(txVerifier.verify(txProof, txPublicInputs), "ReceiverZKBoundBLS: bad tx proof");

        // ── Fase 4: raíz de confianza vía firma BLS (STUB en este prototipo) ──────
        // El verificador real probaría que el sync committee firmó el bloque cuyo
        // signing_root está en sigPublicInputs. Hoy `sigVerifier` devuelve true.
        require(sigVerifier.verify(sigProof, sigPublicInputs), "ReceiverZKBoundBLS: bad signature proof");
        // TODO Fase 4: vincular signing_root (beacon) ↔ txRoot (execution) con pruebas SSZ.
        require(_bindsRoot(txRoot, sigPublicInputs), "ReceiverZKBoundBLS: root not finalized");

        processed[id] = true;
        token.mint(to, amount);
        emit Released(id, to, amount);
    }

    function _rootMatches(bytes32 txRoot, bytes32[] calldata pub) internal pure returns (bool) {
        for (uint256 i = 0; i < 32; i++) {
            if (uint256(pub[i]) != uint256(uint8(txRoot[i]))) return false;
        }
        return true;
    }

    function _recipientMatches(address to, bytes32[] calldata pub) internal pure returns (bool) {
        bytes20 a = bytes20(to);
        for (uint256 i = 0; i < 20; i++) {
            if (uint256(pub[32 + i]) != uint256(uint8(a[i]))) return false;
        }
        return true;
    }

    function _amountMatches(uint256 amount, bytes32[] calldata pub) internal pure returns (bool) {
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(amount >> (8 * (31 - i)));
            if (uint256(pub[52 + i]) != uint256(b)) return false;
        }
        return true;
    }

    /// @dev ⚠️ PLACEHOLDER Fase 4. El chequeo real: que el `signing_root` firmado (en
    /// sigPublicInputs) corresponda, vía pruebas de inclusión SSZ (beacon block →
    /// execution_payload → transactions_root), a este `txRoot`. Sin ese binding, la firma
    /// y la inclusión no están atadas al mismo bloque. Hoy devuelve true (stub).
    function _bindsRoot(bytes32 /*txRoot*/, bytes32[] calldata /*sigPublicInputs*/)
        internal
        pure
        returns (bool)
    {
        return true;
    }
}

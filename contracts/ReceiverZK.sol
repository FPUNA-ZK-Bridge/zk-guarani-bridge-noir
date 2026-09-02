// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GuaraniToken.sol";
import "./verifiers/IHonkVerifier.sol";

interface IRootRegistry {
    function isKnown(bytes32 root) external view returns (bool);
}

/// @title ReceiverZK
/// @notice Versión trustless del Receiver: acuña en N2 (BlockDAG) solo si un
/// verificador Noir on-chain (UltraHonk) valida la prueba de inclusión de la tx
/// `lock` de N1. Reemplaza el `Receiver.mintRemote(onlyRelayer)` del flujo con
/// relayer de confianza.
///
/// Estado de seguridad (ver docs/INTEGRACION_ZK.md §0.4):
///  - Fase 1/2: la prueba demuestra que EXISTE una tx bajo `txRoot`, y el root se
///    confía vía RootRegistry. El mapeo (id,to,amount) todavía no está atado por
///    la prueba: es andamiaje, no seguridad plena.
///  - Fase 3: al exponer (recipient, amount) como inputs públicos del circuito,
///    descomentar los checks _recipientMatches/_amountMatches vuelve seguro el flujo.
///  - Fase 4: reemplazar roots.isKnown(txRoot) por una prueba BLS de finalidad.
contract ReceiverZK {
    GuaraniToken  public immutable token;
    IHonkVerifier public immutable txVerifier; // TxInclusionVerifier (circuito MPT)
    IRootRegistry public immutable roots;

    mapping(uint256 => bool) public processed;

    event Released(uint256 indexed id, address indexed to, uint256 amount);

    constructor(GuaraniToken _token, IHonkVerifier _txVerifier, IRootRegistry _roots) {
        token = _token;
        txVerifier = _txVerifier;
        roots = _roots;
    }

    /// @param id      identificador único de la transferencia (nonce de Sender en N1)
    /// @param to      destinatario en N2
    /// @param amount  monto a acuñar
    /// @param txRoot  transactions_root del bloque L1 donde entró el lock
    /// @param proof   prueba UltraHonk (transcript keccak) del circuito MPT
    /// @param publicInputs inputs públicos del circuito: 32 campos = bytes del root
    function release(
        uint256 id,
        address to,
        uint256 amount,
        bytes32 txRoot,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external {
        require(!processed[id], "ReceiverZK: replay");
        require(roots.isKnown(txRoot), "ReceiverZK: unknown root");       // Fase 4 sustituye esto
        require(_rootMatches(txRoot, publicInputs), "ReceiverZK: root mismatch");

        // Fase 3 — descomentar cuando el circuito exponga recipient/amount:
        // require(_recipientMatches(to, publicInputs), "ReceiverZK: recipient mismatch");
        // require(_amountMatches(amount, publicInputs), "ReceiverZK: amount mismatch");

        require(txVerifier.verify(proof, publicInputs), "ReceiverZK: bad proof");

        processed[id] = true;
        token.mint(to, amount);
        emit Released(id, to, amount);
    }

    /// @dev El ABI de Noir para `pub [u8;32]` produce 32 campos, uno por byte (0..255).
    /// Verificá el layout real de tu circuito mirando target/public_inputs.
    function _rootMatches(bytes32 txRoot, bytes32[] calldata pub) internal pure returns (bool) {
        if (pub.length != 32) return false;
        for (uint256 i = 0; i < 32; i++) {
            if (uint256(pub[i]) != uint256(uint8(txRoot[i]))) return false;
        }
        return true;
    }

    // --- Placeholders Fase 3 (binding) -------------------------------------
    // Cuando el circuito MPT exponga `recipient: pub [u8;20]` y `amount: pub [u8;32]`,
    // implementá la comparación contra los inputs públicos correspondientes:
    //
    // function _recipientMatches(address to, bytes32[] calldata pub) internal pure returns (bool) { ... }
    // function _amountMatches(uint256 amount, bytes32[] calldata pub) internal pure returns (bool) { ... }
}

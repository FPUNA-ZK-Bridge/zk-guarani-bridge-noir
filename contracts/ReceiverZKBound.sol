// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GuaraniToken.sol";
import "./verifiers/IHonkVerifier.sol";

interface IRootRegistry {
    function isKnown(bytes32 root) external view returns (bool);
}

/// @title ReceiverZKBound
/// @notice Fase 3: además de verificar la prueba, EXIGE que los inputs públicos
/// (recipient, amount) coincidan con los argumentos del release. Como el circuito
/// ata (recipient, amount) al calldata de un lock() incluido en el bloque, ya no
/// se puede acuñar sin un lock correspondiente (cierra el gap de la Fase 1).
///
/// Layout de publicInputs (definido por el orden de inputs `pub` del circuito):
///   [0..32]  transactions_root (byte por campo)
///   [32..52] recipient (20 bytes)
///   [52..84] amount (32 bytes, big-endian)
contract ReceiverZKBound {
    GuaraniToken  public immutable token;
    IHonkVerifier public immutable txVerifier;
    IRootRegistry public immutable roots;

    mapping(uint256 => bool) public processed;

    event Released(uint256 indexed id, address indexed to, uint256 amount);

    constructor(GuaraniToken _token, IHonkVerifier _txVerifier, IRootRegistry _roots) {
        token = _token;
        txVerifier = _txVerifier;
        roots = _roots;
    }

    function release(
        uint256 id,
        address to,
        uint256 amount,
        bytes32 txRoot,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external {
        require(!processed[id], "ReceiverZKBound: replay");
        require(publicInputs.length == 84, "ReceiverZKBound: bad public inputs len");
        require(roots.isKnown(txRoot), "ReceiverZKBound: unknown root");
        require(_rootMatches(txRoot, publicInputs), "ReceiverZKBound: root mismatch");
        require(_recipientMatches(to, publicInputs), "ReceiverZKBound: recipient mismatch");
        require(_amountMatches(amount, publicInputs), "ReceiverZKBound: amount mismatch");
        require(txVerifier.verify(proof, publicInputs), "ReceiverZKBound: bad proof");

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
            uint8 b = uint8(amount >> (8 * (31 - i))); // byte big-endian i
            if (uint256(pub[52 + i]) != uint256(b)) return false;
        }
        return true;
    }
}

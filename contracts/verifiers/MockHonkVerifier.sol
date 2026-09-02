// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IHonkVerifier.sol";

/// @notice Verificador de mentira SOLO para tests/desarrollo del cableado.
/// Permite simular una prueba válida o inválida sin correr el circuito real.
/// En producción se reemplaza por el `TxInclusionVerifier.sol` que genera `bb`.
contract MockHonkVerifier is IHonkVerifier {
    bool public result = true;

    function setResult(bool r) external {
        result = r;
    }

    function verify(bytes calldata, bytes32[] calldata)
        external
        view
        returns (bool)
    {
        return result;
    }
}

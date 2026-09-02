# circuits/

ACIR y verificadores de los circuitos Noir que usa el puente.

| Carpeta | Circuito fuente | Rol |
|---|---|---|
| `mpt/` | `../../noir-merkle` (`noir_mpt_verifier`) | Inclusión de la tx `lock` en el bloque (transactions_root) |
| `bls/` | `../../zk-bridge-zero/noir-bls12-381-validator` | Firma del sync committee (signing_root) |

Los artefactos (`*.json` ACIR, `vk`, `proof`) **no se versionan** (ver `.gitignore`):
son grandes y se regeneran. Generalos con:

```bash
npm run circuits:mpt      # copia ACIR + vk keccak + TxInclusionVerifier.sol
npm run circuits:bls      # idem para el BLS (pesado; ver INTEGRACION_ZK.md §6)
```

Ambos scripts corren `scripts/generate-verifiers.sh`, que requiere `nargo` y `bb`
instalados localmente (ver `docs/INTEGRACION_ZK.md` §1 para versiones).

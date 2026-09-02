#!/usr/bin/env bash
# ============================================================================
# Genera el verificador Solidity (UltraHonk, transcript keccak) de un circuito
# Noir y lo deja en contracts/verifiers/.
#
# NO recompila el circuito con nargo: reutiliza el ACIR (target/*.json) que ya
# compilaste. Solo regenera la vk keccak, (opcional) la prueba, y el .sol.
#
# Requisitos: nargo y bb instalados (ver docs/INTEGRACION_ZK.md §1).
#
# Uso:
#   scripts/generate-verifiers.sh mpt
#   scripts/generate-verifiers.sh bls
# ============================================================================
set -euo pipefail

CIRCUIT="${1:-mpt}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$CIRCUIT" in
  mpt)
    SRC_DIR="$ROOT/../noir-merkle"
    ACIR="target/noir_mpt_verifier.json"
    OUT_SOL="$ROOT/contracts/verifiers/TxInclusionVerifier.sol"
    CONTRACT_NAME="TxInclusionVerifier"
    DEST_DIR="$ROOT/circuits/mpt"
    ;;
  bls)
    SRC_DIR="$ROOT/../zk-bridge-zero/noir-bls12-381-validator"
    ACIR="target/noir_bls12_381_validator.json"
    OUT_SOL="$ROOT/contracts/verifiers/SignatureVerifier.sol"
    CONTRACT_NAME="SignatureVerifier"
    DEST_DIR="$ROOT/circuits/bls"
    ;;
  *) echo "Circuito desconocido: $CIRCUIT (usa: mpt | bls)"; exit 1 ;;
esac

command -v bb >/dev/null 2>&1 || { echo "❌ 'bb' no está en PATH. Instalá con bbup."; exit 1; }

echo "▶ Circuito: $CIRCUIT"
echo "▶ Fuente:   $SRC_DIR"
cd "$SRC_DIR"

[ -f "$ACIR" ] || { echo "❌ Falta $ACIR. Corré 'nargo compile' en $SRC_DIR primero."; exit 1; }

echo "▶ (1/3) write_vk (keccak)…"
bb write_vk --scheme ultra_honk --oracle_hash keccak -b "$ACIR" -o target

echo "▶ (2/3) write_solidity_verifier…"
# En algunos nightlies el subcomando es 'contract' en vez de 'write_solidity_verifier'.
# Si falla, probá:  bb contract --scheme ultra_honk -k target/vk -o target/Verifier.sol
bb write_solidity_verifier --scheme ultra_honk -k target/vk -o target/Verifier.sol

echo "▶ (3/3) copiando artefactos…"
mkdir -p "$DEST_DIR"
cp "$ACIR" "$DEST_DIR/"
# Renombra el contrato generado (HonkVerifier) al nombre que esperan los deploys.
sed "s/contract HonkVerifier/contract $CONTRACT_NAME/g" target/Verifier.sol > "$OUT_SOL"

echo "✅ Verificador: $OUT_SOL"
echo "   ACIR:       $DEST_DIR/$(basename "$ACIR")"
echo ""
echo "⚠  Revisá el tamaño del bytecode (límite EIP-170 = 24 KB), sobre todo para 'bls'."

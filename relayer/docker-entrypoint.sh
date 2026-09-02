#!/usr/bin/env bash
# Entrypoint del relayer en Docker: elige ZK o clásico según ENABLE_ZK_PROOF_WAY.
set -e

ZK="${ENABLE_ZK_PROOF_WAY:-false}"

if [ "$ZK" = "true" ]; then
  echo "▶ Relayer ZK — ReceiverZK.release() con verificación de prueba"
  # buildRawCase.js arma la prueba real de cada lock. RAWCASE_FILE queda como
  # modo demo explícito (RAWCASE_FILE=relayer/sample-rawcase.json ...) — sin
  # setearlo, no se fuerza acá, para no pisar locks reales con el fixture.
  export REGISTER_ROOT="${REGISTER_ROOT:-1}"
  exec node relayer/relayer-zk.js
else
  echo "▶ Relayer clásico — mintRemote()"
  exec node relayer/relayer.js
fi

#!/bin/bash
# Deploy de contratos tras levantar los servicios Docker.
# Elige el flujo según ENABLE_ZK_PROOF_WAY (true = ZK, false = clásico).
set -e

ZK="${ENABLE_ZK_PROOF_WAY:-false}"
echo "🚀 Guarani Bridge deployment (ENABLE_ZK_PROOF_WAY=$ZK)"

# Esperar a que las cadenas estén listas
echo "⏳ Waiting for Hardhat (L1)..."
timeout 60 bash -c 'until curl -s http://hardhat-n1:8545 > /dev/null; do sleep 2; done' || exit 1
echo "⏳ Waiting for Anvil (L2)..."
timeout 60 bash -c 'until curl -s http://anvil-n2:9545 > /dev/null; do sleep 2; done' || exit 1
echo "✅ Services are ready!"

# L1: siempre igual (GuaraniToken + Sender)
echo "📦 Deploying GuaraniToken + Sender to L1..."
npm run deploy:n1:docker

# L2: según el modo
if [ "$ZK" = "true" ]; then
  echo "🔒 Deploying ZK contracts to L2 (Verifier + RootRegistry + ReceiverZK)..."
  npm run deploy:n2:zk:docker
else
  echo "📦 Deploying classic Receiver to L2..."
  npm run deploy:n2:docker
fi

# Config del frontend (lee ENABLE_ZK_PROOF_WAY y el deploy correspondiente)
echo "⚙️  Generating frontend config (public/config.js)..."
npm run config

echo ""
echo "✅ Deployment complete!  (modo ZK=$ZK)"
echo "📄 Files: deploy-N1.json + $([ "$ZK" = "true" ] && echo deploy-N2-zk.json || echo deploy-N2.json)  ·  public/config.js"
echo "🌉 Bridge listo."

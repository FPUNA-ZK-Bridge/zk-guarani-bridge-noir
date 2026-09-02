// relayer/prover.js
// Motor ZK off-chain: noir_js ejecuta el circuito MPT → witness; bb.js genera la
// prueba UltraHonk para EVM (transcript keccak) que acepta el Verifier.sol on-chain.
//
// API de @aztec/bb.js 5.0.0-nightly.20260522:
//   - new UltraHonkBackend(bytecode, api)   ← api es una instancia de Barretenberg
//   - generateProof(witness, { verifierTarget: 'evm' })   ← 'evm' = Honk ZK + keccak
//     (matchea el contrato BaseZKHonkVerifier que genera `bb write_solidity_verifier`).
//     Si el verificador fuera no-ZK, usar 'evm-no-zk' (VERIFIER_TARGET=evm-no-zk).
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend, BackendType } from "@aztec/bb.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import os from "os";
import { buildInputs } from "./prepareInputs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CIRCUIT_PATH = join(__dirname, "../circuits/mpt/noir_mpt_verifier.json");

const VERIFIER_TARGET = process.env.VERIFIER_TARGET || "evm";
// El circuito MPT (~1.65M gates) necesita SRS 2^21 (medido en el front de noir-merkle).
const SRS_SIZE = Number(process.env.SRS_SIZE || (1 << 21));
// Forzar WASM: en Docker (arm64-linux) bb.js intenta un backend NATIVO
// (build/arm64-linux/bb) que no está instalado → ENOENT. WasmWorker corre en todos lados.
const BB_BACKEND = process.env.BB_BACKEND === "wasm" ? BackendType.Wasm : BackendType.WasmWorker;

let circuit = null;
let noir = null;
let api = null;
let backend = null;

function loadCircuit() {
  if (!circuit) {
    try {
      circuit = JSON.parse(readFileSync(CIRCUIT_PATH, "utf8"));
    } catch {
      throw new Error(`No encontré el ACIR en ${CIRCUIT_PATH}. Generalo con: npm run circuits:mpt`);
    }
  }
  return circuit;
}

async function getBackend() {
  const c = loadCircuit();
  if (!noir) noir = new Noir(c);
  if (!api) {
    const threads = Math.max(1, Math.min(8, os.cpus().length));
    // srsSize evita el error "trying to get too many points" al probar circuitos grandes.
    api = await Barretenberg.new({ threads, srsSize: SRS_SIZE, backend: BB_BACKEND });
  }
  if (!backend) backend = new UltraHonkBackend(c.bytecode, api);
  return backend;
}

/// Genera la prueba a partir de un rawCase (formato fixtures/*.json de noir-merkle).
/// Devuelve { proof: Uint8Array, publicInputs: string[] (bytes32 hex) }.
export async function proveInclusion(rawCase) {
  const inputs = buildInputs(rawCase);
  const be = await getBackend();
  const { witness } = await noir.execute(inputs);
  const { proof, publicInputs } = await be.generateProof(witness, { verifierTarget: VERIFIER_TARGET });
  return { proof, publicInputs };
}

/// Verificación off-chain (sanity, opcional).
export async function verifyOffchain(proof, publicInputs) {
  const be = await getBackend();
  return be.verifyProof({ proof, publicInputs }, { verifierTarget: VERIFIER_TARGET });
}

/// Libera los workers de bb.js para que el proceso pueda terminar.
export async function destroyBackend() {
  try {
    await api?.destroy?.();
  } catch {
    /* noop */
  }
}

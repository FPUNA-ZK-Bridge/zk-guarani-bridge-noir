// relayer/relayer-zk.js
// Relayer TRUSTLESS: escucha Locked() en N1, genera la ZK-proof MPT off-chain y
// llama a ReceiverZK.release() en N2. Reemplaza el mintRemote() de confianza.
//
// Modo demo (para probar prove→release con un fixture conocido, sin el trie builder):
//   RAWCASE_FILE=../noir-merkle/fixtures/tx_258.json REGISTER_ROOT=1 npm run relayer:zk
import { ethers } from "ethers";
import fs from "fs";
import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { proveInclusion } from "./prover.js";
import { buildRawCase as buildRawCaseLive } from "./buildRawCase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = (p) => join(__dirname, "..", p);

const { RPC_URL_N1, RPC_URL_N2, PRIVATE_KEY_RELAYER, RAWCASE_FILE, REGISTER_ROOT } = process.env;

const providerN1 = RPC_URL_N1?.startsWith("ws")
  ? new ethers.WebSocketProvider(RPC_URL_N1)
  : new ethers.JsonRpcProvider(RPC_URL_N1);
const providerN2 = new ethers.JsonRpcProvider(RPC_URL_N2);
// NonceManager evita "nonce has already been used" al mandar addRoot()+release() seguidas.
const signerN2 = new ethers.NonceManager(new ethers.Wallet(PRIVATE_KEY_RELAYER, providerN2));

const senderAbi = [
  "event Locked(uint256 indexed id, address indexed from, address indexed to, uint256 amount)",
];
const rootsAbi = [
  "function addRoot(bytes32 root)",
  "function isKnown(bytes32) view returns (bool)",
];

const DEPLOY_N1_FILE = root("deploy-N1.json");
const DEPLOY_N2_FILE = root("deploy-N2-zk.json");

// Un redeploy reescribe deploy-N1.json/deploy-N2-zk.json con direcciones (y a
// veces receiverType) nuevas. Antes solo se leían una vez al arrancar, así que
// el relayer seguía apuntando a los contratos viejos hasta reiniciarlo a mano.
// Ahora se detecta el cambio por mtime y se reconstruyen sender/receiver/roots.
let sender, receiver, roots, isBls;
let deployMtimeN1 = 0;
let deployMtimeN2 = 0;

function loadContracts() {
  const n1 = JSON.parse(fs.readFileSync(DEPLOY_N1_FILE));
  const n2 = JSON.parse(fs.readFileSync(DEPLOY_N2_FILE));

  isBls = n2.receiverType === "ReceiverZKBoundBLS";
  const receiverAbi = [
    isBls
      ? "function release(uint256 id, address to, uint256 amount, bytes32 txRoot, bytes txProof, bytes32[] txPublicInputs, bytes sigProof, bytes32[] sigPublicInputs)"
      : "function release(uint256 id, address to, uint256 amount, bytes32 txRoot, bytes proof, bytes32[] publicInputs)",
    "function processed(uint256) view returns (bool)",
    "event Released(uint256 indexed id, address indexed to, uint256 amount)",
  ];

  sender = new ethers.Contract(n1.sender, senderAbi, providerN1);
  receiver = new ethers.Contract(n2.receiver, receiverAbi, signerN2);
  roots = n2.roots ? new ethers.Contract(n2.roots, rootsAbi, signerN2) : null;

  deployMtimeN1 = fs.statSync(DEPLOY_N1_FILE).mtimeMs;
  deployMtimeN2 = fs.statSync(DEPLOY_N2_FILE).mtimeMs;
  console.log(`   contratos (re)cargados: sender=${n1.sender} receiver=${n2.receiver}`);
}

function reloadContractsIfChanged() {
  const m1 = fs.statSync(DEPLOY_N1_FILE).mtimeMs;
  const m2 = fs.statSync(DEPLOY_N2_FILE).mtimeMs;
  if (m1 !== deployMtimeN1 || m2 !== deployMtimeN2) {
    console.log("🔄 deploy-N1.json/deploy-N2-zk.json cambiaron, recargando contratos…");
    loadContracts();
  }
}

loadContracts();

// RAWCASE_FILE=<fixture> sigue existiendo como modo demo explícito (probar
// prove→release sin depender de un lock real). Sin esa env var, se arma el
// rawCase real del bloque L1 donde entró CADA lock (buildRawCase.js — Fase 2
// "deep", MPT proof en vivo en vez del fixture de noir-merkle).
async function buildRawCase(providerN1, txHash) {
  if (RAWCASE_FILE) return JSON.parse(fs.readFileSync(RAWCASE_FILE, "utf8"));
  return buildRawCaseLive(providerN1, txHash);
}

// Prueba ZK: en modo demo (RAWCASE_FILE) usa la PRE-GENERADA (relayer/sample-proof.json)
// si existe → evita correr bb.js dentro del contenedor. Para un lock real (rawCase propio
// de esta tx) SIEMPRE se genera la prueba de verdad — si no, se estaría liberando fondos
// con la prueba de otro (recipient/amount/root ajenos, ver bug del "recipient mismatch").
const PROOF_FILE = root("relayer/sample-proof.json");
async function getProofFor(rawCase) {
  if (RAWCASE_FILE && fs.existsSync(PROOF_FILE)) {
    const p = JSON.parse(fs.readFileSync(PROOF_FILE, "utf8"));
    console.log("   usando prueba pre-generada (relayer/sample-proof.json)");
    return { proofHex: p.proofHex, publicInputs: p.publicInputs, txRoot: p.txRoot };
  }
  console.log("… generando prueba ZK (bb.js) para este lock");
  const { proof, publicInputs } = await proveInclusion(rawCase);
  return {
    proofHex: "0x" + Buffer.from(proof).toString("hex"),
    publicInputs,
    txRoot: "0x" + rawCase.transactions_root.replace(/^0x/, ""),
  };
}

async function handleLocked(id, from, to, amount, ev) {
  console.log(`🔒 Locked id=${id} to=${to} amount=${ethers.formatUnits(amount, 18)}`);
  try {
    if (await receiver.processed(id)) {
      console.log("   (id ya procesado en N2, salteo)\n");
      return;
    }
    const rawCase = await buildRawCase(providerN1, ev?.transactionHash);
    const { proofHex, publicInputs, txRoot } = await getProofFor(rawCase);
    console.log(`   prueba lista (${(proofHex.length - 2) / 2} bytes, ${publicInputs.length} inputs públicos)`);

    if (!isBls && REGISTER_ROOT === "1" && roots && !(await roots.isKnown(txRoot))) {
      const t = await roots.addRoot(txRoot);
      await t.wait();
      console.log("   root registrado en RootRegistry");
    }

    // ReceiverZKBoundBLS pide 2 pruebas: la de firma BLS va stubbeada ("0x00", []).
    const tx = isBls
      ? await receiver.release(id, to, amount, txRoot, proofHex, publicInputs, "0x00", [])
      : await receiver.release(id, to, amount, txRoot, proofHex, publicInputs);
    console.log(`⛓️  release tx: ${tx.hash}`);
    await tx.wait();
    console.log("✅ liberado en N2\n");
  } catch (e) {
    console.error(`❌ ${e.message}`);
  }
}

// Sondeo manual de Locked con queryFilter.
// Evita el bug "results is not iterable" de los filtros de eventos de ethers v6 con
// Hardhat, y procesa también eventos pasados (desde START_BLOCK_N1) → no se pierde
// ningún lock aunque el relayer arranque después.
const POLL_MS = Number(process.env.POLL_MS || 3000);
let nextBlock = Number(process.env.START_BLOCK_N1 || 0);
let lastHead = -1; // último head observado; sirve para distinguir "esperando bloque nuevo" de "la cadena retrocedió"
let busy = false;

async function poll() {
  if (busy) return; // no solapar mientras se genera una prueba (tarda)
  busy = true;
  try {
    reloadContractsIfChanged();
    const head = await providerN1.getBlockNumber();
    // Si reiniciaste las cadenas, el head vuelve a 0 pero el cursor seguía
    // apuntando al bloque viejo → sin esto el poll queda mudo para siempre.
    // OJO: comparar contra el head ANTERIOR, no contra nextBlock — en estado
    // normal (esperando el próximo bloque) head == nextBlock - 1 siempre.
    if (lastHead !== -1 && head < lastHead) {
      console.log(`🔄 N1 retrocedió (head=${head} < último visto=${lastHead}), reseteando cursor`);
      nextBlock = Number(process.env.START_BLOCK_N1 || 0);
    }
    lastHead = head;
    if (head >= nextBlock) {
      const evs = await sender.queryFilter(sender.filters.Locked(), nextBlock, head);
      for (const ev of evs) {
        const { id, from, to, amount } = ev.args;
        await handleLocked(id, from, to, amount, ev);
      }
      nextBlock = head + 1;
    }
  } catch (e) {
    console.error("poll error:", e.shortMessage || e.message);
  } finally {
    busy = false;
  }
}

console.log(`Relayer ZK sondeando Locked() cada ${POLL_MS}ms (desde block ${nextBlock})…`);
setInterval(poll, POLL_MS);
poll();

process.on("unhandledRejection", (r) => {
  if (String(r?.message).includes("results is not iterable")) return;
  console.error("🚨 Unhandled Rejection:", r);
});

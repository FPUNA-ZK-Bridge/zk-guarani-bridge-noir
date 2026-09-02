// scripts/verifyZkProof.js
// Demuestra que el verificador ZK on-chain es REAL (no un sello de goma):
//   TEST 1 — prueba VÁLIDA     → release() acuña en N2
//   TEST 2 — prueba ADULTERADA → release() es RECHAZADO por el verificador
//
// Uso (desde el host, con N2 corriendo):
//   RPC_URL_N2=http://localhost:9545 node scripts/verifyZkProof.js
import { ethers } from "ethers";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = (p) => join(__dirname, "..", p);

const RPC = process.env.RPC_URL_N2 || "http://localhost:9545";
const KEY = process.env.PRIVATE_KEY_RELAYER || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const n2 = JSON.parse(fs.readFileSync(root("deploy-N2-zk.json"), "utf8"));
const sp = JSON.parse(fs.readFileSync(root("relayer/sample-proof.json"), "utf8"));

const provider = new ethers.JsonRpcProvider(RPC);
const signer = new ethers.NonceManager(new ethers.Wallet(KEY, provider));

const receiver = new ethers.Contract(n2.receiver, [
  "function release(uint256 id, address to, uint256 amount, bytes32 txRoot, bytes proof, bytes32[] publicInputs)",
  "function processed(uint256) view returns (bool)",
], signer);
const roots = new ethers.Contract(n2.roots, [
  "function addRoot(bytes32 root)",
  "function isKnown(bytes32) view returns (bool)",
], signer);

// Cambia un byte del proof (mantiene la longitud) para adulterarlo.
function tamper(proofHex) {
  const chars = proofHex.split("");
  const i = Math.floor(chars.length / 2); // un nibble del medio
  chars[i] = chars[i] === "a" ? "b" : "a";
  return chars.join("");
}

async function tryRelease(label, id, proofHex) {
  const to = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const amount = ethers.parseUnits("10", 18);
  try {
    const tx = await receiver.release(id, to, amount, sp.txRoot, proofHex, sp.publicInputs);
    await tx.wait();
    console.log(`   ${label}: ✅ ACEPTADA — release tx ${tx.hash}`);
    return true;
  } catch (e) {
    console.log(`   ${label}: ❌ RECHAZADA — ${e.shortMessage || e.reason || e.message}`);
    return false;
  }
}

async function main() {
  console.log("Verificador desplegado:", n2.verifierType, "@", n2.receiver);
  if (!(await roots.isKnown(sp.txRoot))) {
    await (await roots.addRoot(sp.txRoot)).wait();
    console.log("root del fixture registrado\n");
  }

  const base = Date.now(); // ids únicos para no chocar con replay
  console.log("TEST 1 — prueba VÁLIDA (la que generó el prover):");
  const okValid = await tryRelease("válida  ", base, sp.proofHex);

  console.log("\nTEST 2 — prueba ADULTERADA (un byte cambiado):");
  const okTampered = await tryRelease("adulterada", base + 1, tamper(sp.proofHex));

  console.log("\n─────────────────────────────────────────────");
  if (okValid && !okTampered) {
    console.log("✅ El verificador ZK on-chain es REAL: acepta la prueba válida y");
    console.log("   rechaza la adulterada. La verificación es criptográfica, no un stub.");
  } else {
    console.log("⚠️  Resultado inesperado — revisá: válida =", okValid, "adulterada =", okTampered);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e.message); process.exit(1); });

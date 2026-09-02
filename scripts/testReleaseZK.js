// scripts/testReleaseZK.js
// Prueba END-TO-END del release() contra los contratos YA DESPLEGADOS en N2.
//   • Si el verificador desplegado es el Mock → prueba solo el CABLEADO (rápido).
//   • Si es el TxInclusionVerifier real → genera una prueba ZK real (NoirJS/bb.js)
//     desde un fixture y valida que el verificador on-chain la acepte.
//
// Requisitos: N2 corriendo (anvil/ganache) y deploy-N2-zk.json presente.
// Uso:   npm run demo:zk
//        RAWCASE_FILE=../noir-merkle/fixtures/tx_5.json npm run demo:zk
import { ethers } from "ethers";
import fs from "fs";
import "dotenv/config";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = (p) => join(__dirname, "..", p);

const RPC = process.env.RPC_URL_N2 || "http://127.0.0.1:9545";
// Cuenta #1 del mnemónico estándar = owner del RootRegistry (deployer de N2).
const KEY = process.env.PRIVATE_KEY_RELAYER || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const FIXTURE = process.env.RAWCASE_FILE || root("../noir-merkle/fixtures/tx_258.json");

const n2 = JSON.parse(fs.readFileSync(root("deploy-N2-zk.json")));
const provider = new ethers.JsonRpcProvider(RPC);
// NonceManager lleva el nonce localmente → evita "nonce has already been used"
// al mandar addRoot() y release() seguidas con la misma cuenta.
const signer = new ethers.NonceManager(new ethers.Wallet(KEY, provider));

const receiverAbi = [
  "function release(uint256 id, address to, uint256 amount, bytes32 txRoot, bytes proof, bytes32[] publicInputs)",
  "function processed(uint256) view returns (bool)",
  "event Released(uint256 indexed id, address indexed to, uint256 amount)",
];
const rootsAbi = ["function addRoot(bytes32 root)", "function isKnown(bytes32) view returns (bool)"];
const tokenAbi = ["function balanceOf(address) view returns (uint256)"];

const receiver = new ethers.Contract(n2.receiver, receiverAbi, signer);
const roots = new ethers.Contract(n2.roots, rootsAbi, signer);
const token = new ethers.Contract(n2.token, tokenAbi, provider);

// El ABI de Noir para `pub [u8;32]` produce 32 campos, uno por byte del root.
function rootToPublicInputs(rootHex) {
  return [...ethers.getBytes(rootHex)].map((b) => ethers.zeroPadValue(ethers.toBeHex(b), 32));
}

async function main() {
  const rawCase = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const txRoot = "0x" + rawCase.transactions_root.replace(/^0x/, "");
  const id = BigInt(process.env.ID || Math.floor(Math.random() * 1e9));
  const to = process.env.TO || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const amount = ethers.parseUnits(process.env.AMOUNT || "100", 18);

  console.log("Verificador desplegado:", n2.verifierType);
  console.log("ReceiverZK :", n2.receiver);
  console.log("txRoot     :", txRoot);

  let proofHex, publicInputs;
  if (n2.verifierType === "MockHonkVerifier") {
    console.log("→ Mock: valida solo el CABLEADO (acepta cualquier prueba).");
    proofHex = "0x00";
    publicInputs = rootToPublicInputs(txRoot);
  } else {
    console.log("→ Verificador REAL: generando prueba ZK (NoirJS/bb.js, ~1-2 min)…");
    const { proveInclusion } = await import(pathToFileURL(root("relayer/prover.js")).href);
    const r = await proveInclusion(rawCase);
    proofHex = "0x" + Buffer.from(r.proof).toString("hex");
    publicInputs = r.publicInputs;
    console.log(`   prueba lista: ${r.proof.length} bytes, ${publicInputs.length} inputs públicos`);
  }

  if (!(await roots.isKnown(txRoot))) {
    await (await roots.addRoot(txRoot)).wait();
    console.log("   root registrado en RootRegistry");
  }

  const before = await token.balanceOf(to);
  const tx = await receiver.release(id, to, amount, txRoot, proofHex, publicInputs);
  console.log("release tx :", tx.hash);
  await tx.wait();
  const after = await token.balanceOf(to);

  console.log(`balance ${to.slice(0, 8)}…: ${ethers.formatUnits(before, 18)} → ${ethers.formatUnits(after, 18)} GUA`);
  console.log(after - before === amount ? "✅ E2E OK: fondos liberados en N2" : "❌ el balance no aumentó lo esperado");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌", e.shortMessage || e.reason || e.message || e);
    process.exit(1);
  });

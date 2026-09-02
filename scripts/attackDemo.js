// scripts/attackDemo.js
// Demostración de seguridad: intenta ADULTERAR una transferencia — acuñar (to, amount)
// que no corresponden a un lock real — contra el receiver que esté desplegado.
//
//   Clásico (Receiver.mintRemote)         → el relayer acuña lo que quiera  → VULNERABLE
//   ZK Fase 1 (ReceiverZK)                → (to,amount) no atados a la prueba → VULNERABLE
//   ZK Fase 3 (ReceiverZKBound)           → la prueba ata (recipient,amount) → BLOQUEADO
//
// Uso (host, con N2 corriendo):  node scripts/attackDemo.js
import { ethers } from "ethers";
import fs from "fs";
import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = (p) => join(__dirname, "..", p);

const RPC = process.env.RPC_URL_N2 || "http://localhost:9545";
const KEY = process.env.PRIVATE_KEY_RELAYER || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ATTACKER = process.env.ATTACKER || "0x000000000000000000000000000000000000dEaD";
const HUGE = ethers.parseUnits("1000000", 18);

// Valores "legítimos" del fixture de lock (los que ató el circuito Fase 3)
const REAL_TO = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const REAL_AMOUNT = ethers.parseUnits("10", 18);

const provider = new ethers.JsonRpcProvider(RPC);
const signer = new ethers.NonceManager(new ethers.Wallet(KEY, provider));

// El modo lo decide ENABLE_ZK_PROOF_WAY (como generate-config.js), no la sola
// existencia del archivo — si cambiaste de modo, el deploy-N2-zk.json viejo
// se queda tirado apuntando a contratos de una cadena ya reseteada.
const isZk = String(process.env.ENABLE_ZK_PROOF_WAY || "false") === "true";
const N2_FILE = isZk ? "deploy-N2-zk.json" : "deploy-N2.json";
if (!fs.existsSync(root(N2_FILE))) {
  throw new Error(`Falta ${N2_FILE} (ENABLE_ZK_PROOF_WAY=${isZk}). Redesplegá N2 en este modo primero.`);
}
const n2 = JSON.parse(fs.readFileSync(root(N2_FILE), "utf8"));
const token = new ethers.Contract(n2.token, ["function balanceOf(address) view returns (uint256)"], provider);
const bal = async (a) => ethers.formatUnits(await token.balanceOf(a), 18);

async function attackClassic() {
  console.log("MODO CLÁSICO — receiver", n2.receiver, "\n");
  const receiver = new ethers.Contract(n2.receiver,
    ["function mintRemote(uint256 id, address to, uint256 amount)"], signer);
  console.log(`Ataque: el relayer acuña ${ethers.formatUnits(HUGE, 18)} GUA a un atacante SIN ningún lock…`);
  const before = await bal(ATTACKER);
  try {
    await (await receiver.mintRemote(Date.now() % 1e9, ATTACKER, HUGE)).wait();
    console.log(`❌ VULNERABLE: balance del atacante ${before} → ${await bal(ATTACKER)} GUA.`);
    console.log("   El relayer acuñó lo que quiso: la seguridad depende 100% de confiar en él.");
  } catch (e) {
    console.log("¿bloqueado?:", e.shortMessage || e.message);
  }
}

async function attackZk() {
  const kind = n2.receiverType || "ReceiverZK";
  const isBls = kind === "ReceiverZKBoundBLS";
  console.log("MODO ZK — receiver", n2.receiver, `(${kind})\n`);
  const sp = JSON.parse(fs.readFileSync(root("relayer/sample-proof.json"), "utf8"));
  // ReceiverZKBoundBLS pide 2 pruebas (release toma 8 args); las demás, 1 (6 args).
  // Llamar con la firma equivocada pega contra un selector inexistente y "bloquea"
  // por la razón incorrecta (función no encontrada, no la prueba/binding real).
  const receiver = new ethers.Contract(n2.receiver, [
    isBls
      ? "function release(uint256 id, address to, uint256 amount, bytes32 txRoot, bytes txProof, bytes32[] txPublicInputs, bytes sigProof, bytes32[] sigPublicInputs)"
      : "function release(uint256 id, address to, uint256 amount, bytes32 txRoot, bytes proof, bytes32[] publicInputs)",
  ], signer);
  const extraArgs = isBls ? ["0x00", []] : []; // firma BLS stubbeada, igual que el relayer

  if (!isBls && n2.roots) {
    const roots = new ethers.Contract(n2.roots,
      ["function addRoot(bytes32)", "function isKnown(bytes32) view returns (bool)"], signer);
    if (!(await roots.isKnown(sp.txRoot))) await (await roots.addRoot(sp.txRoot)).wait();
  }

  // Ataque A — prueba FALSA (sin un lock real detrás)
  console.log("Ataque A — prueba FALSA (bytes al azar), valores legítimos:");
  const fakeLen = (sp.proofHex.length - 2) / 2;
  const fakeProof = ethers.hexlify(ethers.randomBytes(fakeLen));
  try {
    await (await receiver.release(Date.now() % 1e9, REAL_TO, REAL_AMOUNT, sp.txRoot, fakeProof, sp.publicInputs, ...extraArgs)).wait();
    console.log("  ❌ VULNERABLE: aceptó una prueba falsa.");
  } catch (e) {
    console.log("  ✅ BLOQUEADO:", e.shortMessage || e.reason || "la prueba no verifica", "— ZK exige una prueba real.");
  }

  // Ataque B — adulterar (to, amount) con la prueba del lock REAL
  console.log("\nAtaque B — adulterar (to, amount) con la prueba del lock real:");
  const before = await bal(ATTACKER);
  try {
    await (await receiver.release((Date.now() % 1e9) + 1, ATTACKER, HUGE, sp.txRoot, sp.proofHex, sp.publicInputs, ...extraArgs)).wait();
    console.log(`  ❌ VULNERABLE (${kind}): balance atacante ${before} → ${await bal(ATTACKER)} GUA.`);
    console.log("     Los (to,amount) NO están atados a la prueba → esto es Fase 1 (andamiaje). Falta desplegar Fase 3.");
  } catch (e) {
    console.log(`  ✅ BLOQUEADO (${kind}):`, e.shortMessage || e.reason, "— la prueba ata (recipient, amount).");
  }
}

async function main() {
  console.log("=== Demo de adulteración de transferencias: clásico vs ZK ===\n");
  // Una tx a una dirección sin código NO revierte (no hay opcode que revierta) — se
  // vería como "bloqueado" o "vulnerable" según el caso, pero sin haber probado nada
  // real. Cortar acá evita ese falso resultado silencioso.
  const code = await provider.getCode(n2.receiver);
  if (code === "0x") {
    throw new Error(
      `${n2.receiver} no tiene código en ${RPC} — ${N2_FILE} está desactualizado ` +
        `(¿reseteaste la cadena sin redesplegar en este modo?). Redesplegá y volvé a correr.`
    );
  }
  if (isZk) await attackZk();
  else await attackClassic();
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e.message); process.exit(1); });

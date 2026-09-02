// scripts/generate-config.js
// Genera public/config.js para el frontend, según ENABLE_ZK_PROOF_WAY.
// Incluye el modo, las direcciones L1/L2 y el evento N2 a escuchar
// (Released en ZK, Minted en clásico).
import { readFileSync, writeFileSync, existsSync } from "fs";

const ZK = String(process.env.ENABLE_ZK_PROOF_WAY || "false") === "true";

function readJson(p) {
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

function main() {
  const n1 = readJson("deploy-N1.json");
  if (!n1?.token || !n1?.sender) {
    console.error("❌ deploy-N1.json no encontrado o inválido. Ejecutá el deploy de N1 primero.");
    process.exit(1);
  }

  const n2File = ZK ? "deploy-N2-zk.json" : "deploy-N2.json";
  const n2 = readJson(n2File);
  if (!n2?.token || !n2?.receiver) {
    console.warn(`⚠  ${n2File} no encontrado — el frontend quedará con direcciones N2 vacías.`);
  }

  const config = {
    MODE: ZK ? "zk" : "classic",
    N2_EVENT: ZK ? "Released" : "Minted",
    CHAIN_N1: "0x7a69", // 31337
    TOKEN_N1: n1.token,
    SENDER_N1: n1.sender,
    TOKEN_N2: n2?.token || "",
    RECEIVER_N2: n2?.receiver || "",
    GENERATED_AT: new Date().toISOString(),
  };

  const js =
    `// Auto-generado por scripts/generate-config.js — NO EDITAR A MANO\n` +
    `window.CONTRACT_CONFIG = ${JSON.stringify(config, null, 2)};\n` +
    `console.log("📄 Config (${config.MODE}):", window.CONTRACT_CONFIG);\n`;

  writeFileSync("public/config.js", js);
  console.log(`✅ public/config.js generado — modo ${config.MODE}`);
  console.log(`   N1  token ${config.TOKEN_N1}  ·  sender ${config.SENDER_N1}`);
  console.log(`   N2  token ${config.TOKEN_N2}  ·  receiver ${config.RECEIVER_N2}  ·  evento ${config.N2_EVENT}`);
}

main();

// scripts/genSampleProof.js
// Genera UNA vez la prueba ZK del fixture (relayer/sample-rawcase.json) y la guarda
// en relayer/sample-proof.json, para que el relayer en Docker la envíe sin correr bb.js.
//
// Correlo donde bb.js funcione (tu Mac):
//   node scripts/genSampleProof.js
// (si tarda o falla por workers:  BB_BACKEND=wasm node scripts/genSampleProof.js)
import { proveInclusion } from "../relayer/prover.js";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = (p) => join(__dirname, "..", p);

async function main() {
  const rawCase = JSON.parse(fs.readFileSync(root("relayer/sample-rawcase.json"), "utf8"));
  console.log("Generando prueba ZK del fixture (1-2 min, baja el SRS la 1ª vez)…");

  const { proof, publicInputs } = await proveInclusion(rawCase);
  const out = {
    txRoot: "0x" + rawCase.transactions_root.replace(/^0x/, ""),
    proofHex: "0x" + Buffer.from(proof).toString("hex"),
    publicInputs,
  };
  fs.writeFileSync(root("relayer/sample-proof.json"), JSON.stringify(out));
  console.log(`✅ Guardado relayer/sample-proof.json — ${proof.length} bytes, ${publicInputs.length} inputs públicos`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌", e.shortMessage || e.message || e);
    process.exit(1);
  });

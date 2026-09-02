// scripts/solc-check.mjs — verificación de compilación OFFLINE (opcional).
//
// Alternativa a `npx hardhat compile` cuando no se puede descargar el binario de
// solc (p. ej. detrás de un proxy). Usa el compilador solc-js del registry npm.
//
// Uso:
//   npm i -D solc@0.8.24
//   node scripts/solc-check.mjs
//
// El camino normal sigue siendo `npm run compile` (Hardhat).
import solc from "solc";
import fs from "fs";
import path from "path";

const base = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const localFiles = [
  "contracts/GuaraniToken.sol",
  "contracts/Sender.sol",
  "contracts/Receiver.sol",
  "contracts/ReceiverZK.sol",
  "contracts/RootRegistry.sol",
  "contracts/Verifier.sol",
  "contracts/verifiers/IHonkVerifier.sol",
  "contracts/verifiers/MockHonkVerifier.sol",
];

const sources = {};
for (const rel of localFiles) sources[rel] = { content: fs.readFileSync(path.join(base, rel), "utf8") };

function findImports(p) {
  for (const c of [path.join(base, "node_modules", p), path.join(base, p), path.join(base, "contracts", p)]) {
    try { return { contents: fs.readFileSync(c, "utf8") }; } catch {}
  }
  return { error: "not found: " + p };
}

const input = {
  language: "Solidity",
  sources,
  settings: { optimizer: { enabled: true, runs: 1 }, outputSelection: { "*": { "*": ["evm.bytecode.object"] } } },
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (out.errors || []).filter((e) => e.severity === "error");
console.log(`solc ${solc.version()} — errors: ${errors.length}`);
if (errors.length) { errors.forEach((e) => console.log(e.formattedMessage)); process.exit(1); }
const size = (f, n) => Math.floor((out.contracts?.[f]?.[n]?.evm?.bytecode?.object || "").length / 2);
console.log("bytecode ReceiverZK:", size("contracts/ReceiverZK.sol", "ReceiverZK"), "B  (límite EIP-170: 24576)");
console.log("✅ COMPILA OK");

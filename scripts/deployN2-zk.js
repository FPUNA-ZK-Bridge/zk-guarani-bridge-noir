// scripts/deployN2-zk.js
// Deploy del flujo TRUSTLESS en N2 (BlockDAG): Token + Verifier + RootRegistry + ReceiverZK.
// Usa el verificador REAL (TxInclusionVerifier) si fue generado; si no, cae al Mock (solo dev).
import hre from "hardhat";
import { writeFileSync } from "fs";
import "dotenv/config";

async function main() {
  const signers = await hre.ethers.getSigners();
  // signer1 como deployer en N2 (mismo criterio que deployN2.js)
  const signer1 = signers[1] ?? signers[0];

  console.log("\n=== N2 (BlockDAG) — DEPLOY ZK ===");
  console.log("Deployer:", signer1.address);

  // ── Token ────────────────────────────────────────────────────────────────
  const Token = await hre.ethers.getContractFactory("GuaraniToken");
  const token = await Token.connect(signer1).deploy(0);
  await token.waitForDeployment();

  // ── Verificador ────────────────────────────────────────────────────────────
  // El verificador Honk de bb usa librerías externas (RelationsLib, ZKTranscriptLib)
  // que hay que desplegar y LINKEAR. Preferimos el REAL; caemos al Mock solo si no
  // está o si USE_MOCK=1, mostrando el motivo.
  let verifier, verifierName;
  if (process.env.USE_MOCK !== "1") {
    try {
      // 1) Desplegar las librerías que el verificador necesita linkear.
      const relationsLib = await (await hre.ethers.getContractFactory("RelationsLib"))
        .connect(signer1).deploy();
      await relationsLib.waitForDeployment();
      const zkTranscriptLib = await (await hre.ethers.getContractFactory("ZKTranscriptLib"))
        .connect(signer1).deploy();
      await zkTranscriptLib.waitForDeployment();

      // 2) Linkear las librerías y desplegar el verificador.
      const V = await hre.ethers.getContractFactory("TxInclusionVerifier", {
        libraries: {
          RelationsLib: await relationsLib.getAddress(),
          ZKTranscriptLib: await zkTranscriptLib.getAddress(),
        },
      });
      verifier = await V.connect(signer1).deploy();
      await verifier.waitForDeployment();
      verifierName = "TxInclusionVerifier";
      console.log(
        "   libs → RelationsLib:", await relationsLib.getAddress(),
        "| ZKTranscriptLib:", await zkTranscriptLib.getAddress()
      );
    } catch (e) {
      verifier = undefined;
      console.warn("⚠  No pude desplegar TxInclusionVerifier — motivo real:");
      console.warn("   " + (e.shortMessage || e.message || String(e)));
      console.warn("   (Generalo con 'npm run circuits:mpt' + 'npm run compile'. Para forzar el mock: USE_MOCK=1)");
    }
  }
  if (!verifier) {
    const V = await hre.ethers.getContractFactory("MockHonkVerifier");
    verifier = await V.connect(signer1).deploy();
    await verifier.waitForDeployment();
    verifierName = "MockHonkVerifier";
  }

  // ── Registro de roots (owner = deployer) ───────────────────────────────────
  const Roots = await hre.ethers.getContractFactory("RootRegistry");
  const roots = await Roots.connect(signer1).deploy();
  await roots.waitForDeployment();

  // ── Receiver ───────────────────────────────────────────────────────────────
  // Variante ZK:  USE_BLS=1   → ReceiverZKBoundBLS (Fase 4: MPT + firma BLS stub)
  //               USE_BOUND=1 → ReceiverZKBound    (Fase 3: binding recipient/amount)
  //               (default)   → ReceiverZK         (Fase 1)
  const variant = process.env.USE_BLS === "1" ? "bls"
    : process.env.USE_BOUND === "1" ? "bound" : "basic";
  let receiver, receiverName, sigVerifierAddr;
  if (variant === "bls") {
    const sig = await (await hre.ethers.getContractFactory("SignatureVerifierStub")).connect(signer1).deploy();
    await sig.waitForDeployment();
    sigVerifierAddr = await sig.getAddress();
    receiverName = "ReceiverZKBoundBLS";
    receiver = await (await hre.ethers.getContractFactory(receiverName)).connect(signer1)
      .deploy(token.target, verifier.target, sig.target);
    console.log("SignatureVerifierStub:", sigVerifierAddr, "(⚠ placeholder Fase 4)");
  } else {
    receiverName = variant === "bound" ? "ReceiverZKBound" : "ReceiverZK";
    receiver = await (await hre.ethers.getContractFactory(receiverName)).connect(signer1)
      .deploy(token.target, verifier.target, roots.target);
  }
  await receiver.waitForDeployment();

  // El receiver debe poder acuñar
  await token.grantRole(await token.MINTER_ROLE(), receiver.target);

  console.log("GUA N2       :", token.target);
  console.log("Verifier     :", verifier.target, `(${verifierName})`);
  console.log("RootRegistry :", roots.target);
  console.log(`${receiverName} :`, receiver.target);

  writeFileSync(
    "deploy-N2-zk.json",
    JSON.stringify(
      {
        token: token.target,
        receiver: receiver.target,
        receiverType: receiverName,
        verifier: verifier.target,
        verifierType: verifierName,
        sigVerifier: sigVerifierAddr,
        roots: roots.target,
      },
      null,
      2
    )
  );
  console.log("→ deploy-N2-zk.json escrito");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

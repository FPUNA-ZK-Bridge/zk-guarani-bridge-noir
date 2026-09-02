// scripts/diagnoseLock.js
// Diagnóstico del lock en N1 SIN MetaMask: verifica contratos/saldo/allowance y
// ejecuta approve+lock desde la cuenta #0. Aísla si el problema es on-chain o del navegador.
//
// Uso (Docker):
//   docker compose run --rm deployer npx hardhat run scripts/diagnoseLock.js --network dockerN1
import hre from "hardhat";
import fs from "fs";

async function main() {
  const n1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));
  const [acct0] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  const amount = hre.ethers.parseUnits(process.env.AMOUNT || "10", 18);
  const dest = process.env.DEST || acct0.address;

  const codeToken = await provider.getCode(n1.token);
  const codeSender = await provider.getCode(n1.sender);

  console.log("chainId       :", (await provider.getNetwork()).chainId.toString());
  console.log("cuenta #0     :", acct0.address);
  console.log("token  (N1)   :", n1.token, "· ¿existe?", codeToken !== "0x");
  console.log("sender (N1)   :", n1.sender, "· ¿existe?", codeSender !== "0x");

  if (codeToken === "0x" || codeSender === "0x") {
    console.log("❌ Un contrato no existe en esta cadena → el deploy y MetaMask apuntan a cadenas distintas.");
    return;
  }

  const token = await hre.ethers.getContractAt("GuaraniToken", n1.token, acct0);
  const sender = await hre.ethers.getContractAt("Sender", n1.sender, acct0);

  console.log("sender.token():", await sender.token(), "(debe == token N1)");
  console.log("balance #0    :", hre.ethers.formatUnits(await token.balanceOf(acct0.address), 18), "GUA");
  console.log("allowance     :", hre.ethers.formatUnits(await token.allowance(acct0.address, n1.sender), 18), "GUA");

  console.log(`\n→ approve ${hre.ethers.formatUnits(amount, 18)} GUA al Sender…`);
  await (await token.approve(n1.sender, amount)).wait();

  console.log("→ lock…");
  try {
    const tx = await sender.lock(dest, amount);
    const rc = await tx.wait();
    const id = (await sender.nonce()) - 1n;
    console.log(`✅ LOCK OK — tx ${tx.hash} (block ${rc.blockNumber}), Locked id=${id}`);
    console.log("   Los contratos y la cadena están bien → el fallo en el navegador es de MetaMask");
    console.log("   (red equivocada o nonce cacheado: Configuración → Avanzado → Borrar datos de actividad).");
  } catch (e) {
    console.log("❌ LOCK revierte:", e.shortMessage || e.reason || e.message);
    console.log("   Ese es el motivo real (no MetaMask).");
  }
}

main().catch((e) => {
  console.error("❌", e.shortMessage || e.reason || e.message || e);
  process.exit(1);
});

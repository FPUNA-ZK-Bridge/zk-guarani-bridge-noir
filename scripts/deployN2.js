// scripts/deployL2.js
import hre from "hardhat";
import { writeFileSync } from "fs";
import "dotenv/config";
import { getRelayer } from "../utils/accounts.js";
async function main() {
  // signer[0] = deployer  ·  signer[1] = usaremos como relayer por defecto
  // (en redes con una sola cuenta configurada, como las testnets, no hay
  // signer[1] — reusamos el deployer)
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  const signer1 = signers[1] ?? deployer;

  // Relayer autorizado: la cuenta de PRIVATE_KEY_RELAYER si está seteada
  // (testnet/producción), si no la cuenta[1] fija de la mnemonic local.
  const relayerAddr = process.env.PRIVATE_KEY_RELAYER
    ? new hre.ethers.Wallet(process.env.PRIVATE_KEY_RELAYER).address
    : getRelayer().address;

  // 🔧 FIX: Usa signer1 como deployer en L2 para generar addresses diferentes
  console.log("\n=== L2 DEPLOY ===");
  console.log("N1 Deployer (account[0]):", deployer.address);
  console.log("N2 Deployer (account[1]):", signer1.address);
  console.log("Relayer                 :", relayerAddr);

  // ─────────────────  TOKEN  ─────────────────
  const Token = await hre.ethers.getContractFactory("GuaraniToken");
  const token = await Token.connect(signer1).deploy(0); // 🔧 Deploy con signer1
  await token.waitForDeployment();

  // ─────────────────  RECEIVER  ──────────────
  const Receiver = await hre.ethers.getContractFactory("Receiver");
  const receiver = await Receiver.connect(signer1).deploy(
    token.target,
    relayerAddr
  ); // 🔧 Deploy con signer1
  await receiver.waitForDeployment();

  // otorga rol de minter al Receiver (desde signer1 que es el owner del token)
  await token.grantRole(await token.MINTER_ROLE(), receiver.target);

  console.log("GUA N2   :", token.target);
  console.log("Receiver :", receiver.target);

  writeFileSync(
    "deploy-N2.json",
    JSON.stringify(
      { token: token.target, receiver: receiver.target, relayer: relayerAddr },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

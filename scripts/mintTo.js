// scripts/mintTo.js
// Mintea GUA en N1 a una cuenta (p. ej. la que usás en MetaMask) para poder hacer lock.
// El signer[0] de la red configurada tiene MINTER_ROLE (es quien desplegó el token).
//
// Uso (Docker):
//   docker compose run --rm -e MINT_TO=0xTU_CUENTA deployer \
//     npx hardhat run scripts/mintTo.js --network dockerN1
// Uso (local):
//   MINT_TO=0xTU_CUENTA npx hardhat run scripts/mintTo.js --network localN1
import hre from "hardhat";
import fs from "fs";

async function main() {
  const to = process.env.MINT_TO;
  if (!to || !hre.ethers.isAddress(to)) throw new Error("Falta MINT_TO=0x... (dirección válida)");
  const amount = hre.ethers.parseUnits(process.env.MINT_AMOUNT || "1000", 18);

  const n1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));
  const [minter] = await hre.ethers.getSigners(); // tiene MINTER_ROLE
  const token = await hre.ethers.getContractAt("GuaraniToken", n1.token, minter);

  console.log("Token N1 :", n1.token);
  console.log("Minter   :", minter.address);
  console.log("Destino  :", to);
  console.log("Balance previo:", hre.ethers.formatUnits(await token.balanceOf(to), 18), "GUA");

  const tx = await token.mint(to, amount);
  await tx.wait();

  console.log(`✅ Minteados ${hre.ethers.formatUnits(amount, 18)} GUA`);
  console.log("Balance nuevo :", hre.ethers.formatUnits(await token.balanceOf(to), 18), "GUA");
}

main().catch((e) => {
  console.error("❌", e.shortMessage || e.message || e);
  process.exit(1);
});

// scripts/checkN2Balance.js
// Muestra el balance de GUA en N2 (BlockDAG) de una cuenta — para confirmar el mint/release.
// Uso (Docker):
//   docker compose run --rm -e WHO=0x... deployer npx hardhat run scripts/checkN2Balance.js --network dockerN2
import hre from "hardhat";
import fs from "fs";

async function main() {
  const zk = process.env.ENABLE_ZK_PROOF_WAY === "true";
  const file = zk ? "deploy-N2-zk.json" : "deploy-N2.json";
  const n2 = JSON.parse(fs.readFileSync(file, "utf8"));
  const who = process.env.WHO || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  const token = await hre.ethers.getContractAt("GuaraniToken", n2.token);
  const bal = await token.balanceOf(who);

  console.log(`N2 (${file})  ·  token ${n2.token}  ·  receiver ${n2.receiver}`);
  console.log(`balance ${who}: ${hre.ethers.formatUnits(bal, 18)} GUA`);
}

main().catch((e) => {
  console.error("❌", e.shortMessage || e.message || e);
  process.exit(1);
});

import { expect } from "chai";
import hre from "hardhat";
import fs from "fs";
const { ethers } = hre;

// Con modo ZK activo se despliega deploy-N2-zk.json (sin campo `relayer`, ver
// sección 6); en modo clásico, deploy-N2.json (con `relayer`, deployN2.js).
const N2_FILE = fs.existsSync("deploy-N2-zk.json") ? "deploy-N2-zk.json" : "deploy-N2.json";

describe("🏗️ Infrastructure & Network Tests", function () {

  describe("📋 1. DEPLOYMENT FILES VERIFICATION", function () {
    it("✅ Should have valid deploy-N1.json", async function () {
      try {
        const deployN1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));

        expect(deployN1).to.have.property("token");
        expect(deployN1).to.have.property("sender");
        expect(ethers.isAddress(deployN1.token)).to.be.true;
        expect(ethers.isAddress(deployN1.sender)).to.be.true;

        console.log(`   ✅ N1 Deploy file valid:`);
        console.log(`      - Token:  ${deployN1.token}`);
        console.log(`      - Sender: ${deployN1.sender}`);
      } catch (error) {
        console.log(`   ❌ deploy-N1.json error: ${error.message}`);
        throw error;
      }
    });

    it(`✅ Should have valid ${N2_FILE}`, async function () {
      try {
        const deployN2 = JSON.parse(fs.readFileSync(N2_FILE, "utf8"));

        expect(deployN2).to.have.property("token");
        expect(deployN2).to.have.property("receiver");
        expect(ethers.isAddress(deployN2.token)).to.be.true;
        expect(ethers.isAddress(deployN2.receiver)).to.be.true;

        console.log(`   ✅ N2 Deploy file valid:`);
        console.log(`      - Token:    ${deployN2.token}`);
        console.log(`      - Receiver: ${deployN2.receiver}`);
      } catch (error) {
        console.log(`   ❌ ${N2_FILE} error: ${error.message}`);
        throw error;
      }
    });
  });

  describe("🌐 2. NETWORK CONNECTIVITY TESTS", function () {
    it("✅ Should connect to current network", async function () {
      const network = await ethers.provider.getNetwork();
      const blockNumber = await ethers.provider.getBlockNumber();
      const [signer] = await ethers.getSigners();

      console.log(`   ✅ Network Info:`);
      console.log(`      - Chain ID: ${network.chainId}`);
      console.log(`      - Name: ${network.name}`);
      console.log(`      - Block Number: ${blockNumber}`);
      console.log(`      - Signer: ${signer.address}`);

      expect(blockNumber).to.be.greaterThan(0);
    });

    it("🔍 Should check if N1 contracts are deployed", async function () {
      try {
        const deployN1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));

        // Try to get contract code
        const tokenCode = await ethers.provider.getCode(deployN1.token);
        const senderCode = await ethers.provider.getCode(deployN1.sender);

        console.log(`   🔍 N1 Contract Status:`);
        console.log(`      - Token deployed: ${tokenCode !== "0x" ? "✅" : "❌"}`);
        console.log(`      - Sender deployed: ${senderCode !== "0x" ? "✅" : "❌"}`);

        if (tokenCode === "0x" || senderCode === "0x") {
          console.log(`   ⚠️  WARNING: Some N1 contracts not found on current network`);
          console.log(`   💡 Run: npm run deploy:n1`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking N1 contracts: ${error.message}`);
      }
    });
  });

  describe("📜 3. DEPLOYED CONTRACTS VERIFICATION", function () {
    it("🔍 Should verify N1 contracts functionality", async function () {
      try {
        const deployN1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));

        // Check if contracts exist
        const tokenCode = await ethers.provider.getCode(deployN1.token);
        const senderCode = await ethers.provider.getCode(deployN1.sender);

        if (tokenCode === "0x" || senderCode === "0x") {
          console.log(`   ⚠️  SKIPPING: Contracts not deployed on current network`);
          this.skip();
          return;
        }

        // Test contract calls
        const token = await ethers.getContractAt("GuaraniToken", deployN1.token);
        const sender = await ethers.getContractAt("Sender", deployN1.sender);

        const tokenSymbol = await token.symbol();
        const tokenDecimals = await token.decimals();
        const senderNonce = await sender.nonce();
        const senderTokenAddr = await sender.token();

        console.log(`   ✅ N1 Contract Verification:`);
        console.log(`      - Token Symbol: ${tokenSymbol}`);
        console.log(`      - Token Decimals: ${tokenDecimals}`);
        console.log(`      - Sender Nonce: ${senderNonce}`);
        console.log(`      - Sender->Token: ${senderTokenAddr}`);
        console.log(`      - Match: ${senderTokenAddr.toLowerCase() === deployN1.token.toLowerCase() ? "✅" : "❌"}`);

        expect(tokenSymbol).to.equal("GUA");
        expect(tokenDecimals).to.equal(18);
        expect(senderTokenAddr.toLowerCase()).to.equal(deployN1.token.toLowerCase());

      } catch (error) {
        console.log(`   ❌ N1 Contract verification failed: ${error.message}`);
        throw error;
      }
    });
  });

  describe("🔄 4. EVENT LISTENING SIMULATION", function () {
    it("✅ Should simulate relayer event listening", async function () {
      try {
        const deployN1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));

        // Check if sender exists
        const senderCode = await ethers.provider.getCode(deployN1.sender);
        if (senderCode === "0x") {
          console.log(`   ⚠️  SKIPPING: Sender contract not deployed`);
          this.skip();
          return;
        }

        const sender = await ethers.getContractAt("Sender", deployN1.sender);

        // Set up event filter
        const filter = sender.filters.Locked();

        console.log(`   ✅ Event Filter Setup:`);
        console.log(`      - Contract: ${deployN1.sender}`);
        console.log(`      - Event: Locked(uint256,address,address,uint256)`);
        console.log(`      - Filter: ${JSON.stringify(filter)}`);

        // Try to get past events
        const currentBlock = await ethers.provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 100); // Last 100 blocks

        const events = await sender.queryFilter(filter, fromBlock, currentBlock);

        console.log(`   📊 Event History (blocks ${fromBlock}-${currentBlock}):`);
        console.log(`      - Found Events: ${events.length}`);

        events.forEach((event, index) => {
          const args = event.args;
          console.log(`      - Event ${index}: ID=${args.id}, From=${args.from.substring(0,8)}..., Amount=${ethers.formatUnits(args.amount, 18)} GUA`);
        });

        if (events.length === 0) {
          console.log(`   💡 No Locked events found. Try bridging some tokens first.`);
        }

      } catch (error) {
        console.log(`   ❌ Event listening simulation failed: ${error.message}`);
        throw error;
      }
    });
  });

  describe("🎯 5. FRONTEND ADDRESS VERIFICATION", function () {
    it("🔍 Should check frontend vs deployed addresses (public/config.js)", async function () {
      try {
        const deployN1 = JSON.parse(fs.readFileSync("deploy-N1.json", "utf8"));

        // public/config.js lo genera `npm run config` (scripts/generate-config.js);
        // el frontend ya no tiene direcciones hardcodeadas en index.html.
        if (!fs.existsSync("public/config.js")) {
          console.log(`   ⚠️  SKIPPING: public/config.js no existe (corré: npm run config)`);
          this.skip();
          return;
        }
        const configContent = fs.readFileSync("public/config.js", "utf8");

        const tokenMatch = configContent.match(/TOKEN_N1\s*:\s*["']([^"']+)["']/);
        const senderMatch = configContent.match(/SENDER_N1\s*:\s*["']([^"']+)["']/);

        const frontendToken = tokenMatch ? tokenMatch[1] : null;
        const frontendSender = senderMatch ? senderMatch[1] : null;

        console.log(`   🔍 Address Comparison:`);
        console.log(`      - Deploy N1 Token:  ${deployN1.token}`);
        console.log(`      - Config Token:     ${frontendToken || "NOT FOUND"}`);
        console.log(`      - Match: ${deployN1.token.toLowerCase() === frontendToken?.toLowerCase() ? "✅" : "❌"}`);
        console.log(`      - Deploy N1 Sender: ${deployN1.sender}`);
        console.log(`      - Config Sender:    ${frontendSender || "NOT FOUND"}`);
        console.log(`      - Match: ${deployN1.sender.toLowerCase() === frontendSender?.toLowerCase() ? "✅" : "❌"}`);

        if (deployN1.token.toLowerCase() !== frontendToken?.toLowerCase()) {
          console.log(`   ⚠️  TOKEN ADDRESS MISMATCH! Corré: npm run config`);
        }
        if (deployN1.sender.toLowerCase() !== frontendSender?.toLowerCase()) {
          console.log(`   ⚠️  SENDER ADDRESS MISMATCH! Corré: npm run config`);
        }

      } catch (error) {
        console.log(`   ❌ Frontend verification failed: ${error.message}`);
      }
    });
  });

  describe("🔧 6. RELAYER CONFIGURATION CHECK", function () {
    it("🔍 Should verify relayer address consistency (solo modo clásico)", async function () {
      // En modo ZK no hay relayer de confianza: ReceiverZK*/RootRegistry no
      // guardan una dirección de relayer, cualquiera con una prueba válida
      // puede llamar a release(). Este check solo aplica al Receiver clásico.
      if (N2_FILE !== "deploy-N2.json") {
        console.log(`   ⚠️  SKIPPING: modo ZK (${N2_FILE}) no tiene relayer de confianza`);
        this.skip();
        return;
      }
      try {
        const deployN2 = JSON.parse(fs.readFileSync(N2_FILE, "utf8"));

        console.log(`   🔍 Relayer Configuration:`);
        console.log(`      - Deploy N2 Relayer: ${deployN2.relayer}`);

        // Check if the relayer address matches expected patterns
        const accounts = await ethers.getSigners();
        const accountAddresses = accounts.map(acc => acc.address);

        console.log(`      - Available Accounts:`);
        accountAddresses.slice(0, 3).forEach((addr, i) => {
          console.log(`         [${i}]: ${addr}`);
        });

        const relayerIsKnownAccount = accountAddresses.includes(deployN2.relayer);
        console.log(`      - Relayer is known account: ${relayerIsKnownAccount ? "✅" : "❌"}`);

        if (!relayerIsKnownAccount) {
          console.log(`   ⚠️  WARNING: Relayer address not in available accounts`);
          console.log(`   💡 Make sure the relayer private key is correct in .env`);
        }

      } catch (error) {
        console.log(`   ❌ Relayer configuration check failed: ${error.message}`);
      }
    });
  });
});

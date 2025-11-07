const hre = require("hardhat");
const fs = require("fs");

/**
 * Deploy token using pre-mined vanity salt
 *
 * Usage: npx hardhat run scripts/deploy-with-vanity-salt.js --network sepolia
 */

async function main() {
  // Load pre-mined salts
  const saltsFile = "vanity-salts.json";

  if (!fs.existsSync(saltsFile)) {
    console.log("❌ No vanity salts file found!");
    console.log("Run: npx hardhat run scripts/vanity-miner-only.js");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(saltsFile, "utf8"));

  console.log("Available Vanity Addresses:\n");
  data.results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.suffix.padEnd(6)} → ${r.address}`);
  });

  // ========== CONFIGURATION - EDIT THIS ==========

  // Choose which vanity address to use (0 = first, 1 = second, etc.)
  const chosenIndex = 0; // ← Change this to select different address

  // IMPORTANT: These MUST match the template used when mining
  // If you change these, the address will be different
  const name = data.template.name;
  const symbol = data.template.symbol;
  const description = data.template.description;
  const imageUrl = data.template.imageUrl;
  const website = data.template.website;
  const twitter = data.template.twitter;
  const telegram = data.template.telegram;

  // ================================================

  if (chosenIndex >= data.results.length) {
    console.log("❌ Invalid index! Choose between 0 and", data.results.length - 1);
    process.exit(1);
  }

  const chosen = data.results[chosenIndex];
  const [deployer] = await hre.ethers.getSigners();

  console.log("\n========================================");
  console.log("Deploying Token with Vanity Address");
  console.log("========================================\n");
  console.log("Factory:", data.factory);
  console.log("Creator:", deployer.address);
  console.log("Chosen suffix:", chosen.suffix);
  console.log("Expected address:", chosen.address);
  console.log("Salt:", chosen.salt);
  console.log();

  // Verify creator matches
  if (deployer.address !== data.creator) {
    console.log("⚠️  WARNING: Different creator address!");
    console.log("   Mined with:", data.creator);
    console.log("   Deploying with:", deployer.address);
    console.log("   → Address will be DIFFERENT!\n");
  }

  const factory = await hre.ethers.getContractAt(
    "FullBondingCurveFactorySepoliaUSD",
    data.factory
  );

  console.log("Creating token...");

  const createTx = await factory.createToken(
    name,
    symbol,
    description,
    imageUrl,
    website,
    twitter,
    telegram,
    chosen.salt,
    {
      value: hre.ethers.parseEther("0.005"),
      maxFeePerGas: hre.ethers.parseUnits("50", "gwei"),
      maxPriorityFeePerGas: hre.ethers.parseUnits("2", "gwei")
    }
  );

  console.log("Waiting for confirmation...");
  const receipt = await createTx.wait();

  const tokenCreatedEvent = receipt.logs.find(log => {
    try {
      const parsed = factory.interface.parseLog(log);
      return parsed.name === "TokenCreated";
    } catch {
      return false;
    }
  });

  const actualAddress = factory.interface.parseLog(tokenCreatedEvent).args.tokenAddress;

  console.log("\n✅ TOKEN DEPLOYED!\n");
  console.log("Expected:", chosen.address);
  console.log("Actual:", actualAddress);
  console.log("Match:", chosen.address === actualAddress ? "✅ YES" : "❌ NO");
  console.log("Ends with '" + chosen.suffix + "':", actualAddress.toLowerCase().endsWith(chosen.suffix) ? "✅ YES" : "❌ NO");
  console.log("\nTransaction:", receipt.hash);
  console.log("Etherscan:", "https://sepolia.etherscan.io/address/" + actualAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

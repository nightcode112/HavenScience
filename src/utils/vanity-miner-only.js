const hre = require("hardhat");
const fs = require("fs");

/**
 * Vanity Address Miner (Mining Only - No Deployment)
 *
 * Pre-mines vanity salts and saves them to a file for later use
 *
 * Usage: npx hardhat run scripts/vanity-miner-only.js
 */

async function main() {
  // ========== CONFIGURATION ==========
  const factoryAddress = "0x2Ac381b181E0A86EB0D4dAE77AC9C0146fd73bCa";

  // How many vanity addresses to mine
  const desiredSuffixes = [
    "cafe",
    "beef",
    "babe",
    "dead",
    "fade",
    // can add more here
  ];

  // Token template
  const tokenTemplate = {
    name: "Template",
    symbol: "TMP",
    description: "Template token",
    imageUrl: "https://example.com/image.png",
    website: "https://example.com",
    twitter: "@template",
    telegram: "t.me/template"
  };

  // ========================================

  const [deployer] = await hre.ethers.getSigners();

  console.log("Vanity Address Pre-Miner\n");
  console.log("Factory:", factoryAddress);
  console.log("Creator:", deployer.address);
  console.log("Mining", desiredSuffixes.length, "vanity addresses...\n");

  const factory = await hre.ethers.getContractAt(
    "FullBondingCurveFactorySepoliaUSD",
    factoryAddress
  );

  // Get creation code
  const creationCodeHashFromFactory = await factory.getCreationCodeHash();
  const ERC20Factory = await hre.ethers.getContractFactory("FullBondingCurveERC20SepoliaUSD1ETH");
  const creationCode = ERC20Factory.bytecode;

  console.log("Creation code hash verified:", hre.ethers.keccak256(creationCode) === creationCodeHashFromFactory ? "✅" : "❌");
  console.log();

  // Helper function
  function stringToBytes32(str) {
    const bytes = hre.ethers.toUtf8Bytes(str);
    if (bytes.length > 32) {
      return hre.ethers.hexlify(bytes.slice(0, 32));
    }
    const padded = new Uint8Array(32);
    padded.set(bytes);
    return hre.ethers.hexlify(padded);
  }

  // Pre-compute template hashes
  const descHash = stringToBytes32(tokenTemplate.description);
  const imgHash = stringToBytes32(tokenTemplate.imageUrl);
  const socialHash = hre.ethers.keccak256(
    hre.ethers.solidityPacked(
      ["string", "string", "string"],
      [tokenTemplate.website, tokenTemplate.twitter, tokenTemplate.telegram]
    )
  );

  const constructorArgs = hre.ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "bytes32", "bytes32", "bytes32", "address", "address"],
    [tokenTemplate.name, tokenTemplate.symbol, descHash, imgHash, socialHash, deployer.address, factoryAddress]
  );

  const initCode = hre.ethers.concat([creationCode, constructorArgs]);
  const initCodeHash = hre.ethers.keccak256(initCode);

  // Mine all vanity addresses
  const results = [];

  for (const desiredSuffix of desiredSuffixes) {
    console.log(`\n[${ desiredSuffixes.indexOf(desiredSuffix) + 1}/${desiredSuffixes.length}] Mining for: "${desiredSuffix}"`);
    console.log("Estimated attempts:", Math.pow(16, desiredSuffix.length).toLocaleString());

    let attempts = 0;
    let winningSalt;
    let winningAddress;
    const startTime = Date.now();

    while (true) {
      attempts++;
      const salt = hre.ethers.hexlify(hre.ethers.randomBytes(32));

      const hash = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ["bytes1", "address", "bytes32", "bytes32"],
          ["0xff", factoryAddress, salt, initCodeHash]
        )
      );
      const predictedAddress = "0x" + hash.slice(-40);

      if (predictedAddress.toLowerCase().endsWith(desiredSuffix.toLowerCase())) {
        winningSalt = salt;
        winningAddress = hre.ethers.getAddress(predictedAddress);
        break;
      }

      if (attempts % 1000 === 0) {
        process.stdout.write(`\rAttempts: ${attempts.toLocaleString()}...`);
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.floor(attempts / elapsed);

    console.log(`\n✅ Found!`);
    console.log("   Salt:", winningSalt);
    console.log("   Address:", winningAddress);
    console.log("   Time:", elapsed.toFixed(2), "seconds");
    console.log("   Rate:", rate.toLocaleString(), "attempts/s");

    results.push({
      suffix: desiredSuffix,
      salt: winningSalt,
      address: winningAddress,
      attempts,
      timeSeconds: elapsed,
      rate
    });
  }

  // Save results to file
  const outputFile = "vanity-salts.json";
  const output = {
    factory: factoryAddress,
    creator: deployer.address,
    minedAt: new Date().toISOString(),
    template: tokenTemplate,
    results: results,
    note: "These salts are based on the template token params. Actual addresses will differ if you change token name, symbol, description, etc."
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

  console.log("\n========================================");
  console.log("✅ MINING COMPLETE!");
  console.log("========================================\n");
  console.log("Results saved to:", outputFile);
  console.log("\nSummary:");
  results.forEach(r => {
    console.log(`  ${r.suffix.padEnd(6)} → ${r.address} (${r.attempts.toLocaleString()} attempts)`);
  });

  console.log("\n⚠️  IMPORTANT:");
  console.log("These salts only work with the EXACT token parameters used in mining.");
  console.log("If you change name, symbol, description, etc., you need to re-mine.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/**
 * Deployment script for HavenRouter
 *
 * Usage: node contracts/deploy-router.js
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// BSC Mainnet configuration
const BSC_RPC = process.env.BSC_RPC_URL || process.env.VITE_BSC_RPC_URL;
const PANCAKE_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const HAVEN_TOKEN = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

async function main() {
    console.log('=== HavenRouter Deployment ===\n');

    // Check if Solidity compiler is available
    const solcInstalled = await checkSolc();
    if (!solcInstalled) {
        console.error('❌ Solidity compiler not found');
        console.log('\nInstall with: npm install -g solc');
        process.exit(1);
    }

    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(BSC_RPC);

    // Get private key from environment or prompt
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
        console.error('❌ DEPLOYER_PRIVATE_KEY not set in environment');
        console.log('\nSet with: export DEPLOYER_PRIVATE_KEY="0x..."');
        process.exit(1);
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    console.log('Deployer address:', wallet.address);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log('Balance:', ethers.formatEther(balance), 'BNB\n');

    if (balance < ethers.parseEther('0.01')) {
        console.error('❌ Insufficient balance for deployment (need at least 0.01 BNB)');
        process.exit(1);
    }

    // Compile contract
    console.log('📝 Compiling HavenRouter.sol...');
    const compiled = await compileContract();

    if (!compiled) {
        console.error('❌ Compilation failed');
        process.exit(1);
    }

    console.log('✅ Compilation successful\n');

    // Deploy
    console.log('🚀 Deploying HavenRouter...');
    console.log('Constructor args:');
    console.log('  - PancakeRouter:', PANCAKE_ROUTER_V2);
    console.log('  - HAVEN Token:', HAVEN_TOKEN);
    console.log('  - WBNB:', WBNB);
    console.log('');

    const factory = new ethers.ContractFactory(
        compiled.abi,
        compiled.bytecode,
        wallet
    );

    const contract = await factory.deploy(
        PANCAKE_ROUTER_V2,
        HAVEN_TOKEN,
        WBNB
    );

    console.log('⏳ Waiting for deployment...');
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log('✅ HavenRouter deployed at:', address);
    console.log('');

    // Verify configuration
    console.log('🔍 Verifying configuration...');
    const pancakeRouter = await contract.pancakeRouter();
    const havenToken = await contract.havenToken();
    const wbnb = await contract.wbnb();
    const owner = await contract.owner();

    console.log('  PancakeRouter:', pancakeRouter);
    console.log('  HAVEN Token:', havenToken);
    console.log('  WBNB:', wbnb);
    console.log('  Owner:', owner);
    console.log('');

    // Save deployment info
    const deploymentInfo = {
        network: 'bsc-mainnet',
        address: address,
        deployer: wallet.address,
        timestamp: new Date().toISOString(),
        constructor: {
            pancakeRouter: PANCAKE_ROUTER_V2,
            havenToken: HAVEN_TOKEN,
            wbnb: WBNB
        },
        txHash: contract.deploymentTransaction().hash
    };

    const outputPath = path.join(__dirname, 'HavenRouter-deployment.json');
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
    console.log('📄 Deployment info saved to:', outputPath);

    // Output ABI for frontend
    const abiPath = path.join(__dirname, '../src/contracts/abis/HavenRouter.json');
    fs.mkdirSync(path.dirname(abiPath), { recursive: true });
    fs.writeFileSync(abiPath, JSON.stringify(compiled.abi, null, 2));
    console.log('📄 ABI saved to:', abiPath);

    console.log('\n✅ Deployment complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Update frontend with router address:', address);
    console.log('2. Verify contract on BSCScan:');
    console.log('   npx hardhat verify --network bsc', address, PANCAKE_ROUTER_V2, HAVEN_TOKEN, WBNB);
    console.log('3. Test the router with a small BNB amount');
}

async function checkSolc() {
    try {
        const { execSync } = await import('child_process');
        execSync.default('solc --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

async function compileContract() {
    const { execSync } = await import('child_process');
    const contractPath = path.join(__dirname, 'HavenRouter.sol');

    try {
        // Compile with solc
        const output = execSync.default(
            `solc --optimize --optimize-runs 200 --combined-json abi,bin ${contractPath}`,
            { encoding: 'utf8' }
        );

        const compiled = JSON.parse(output);
        const contractKey = Object.keys(compiled.contracts).find(key => key.includes('HavenRouter'));

        if (!contractKey) {
            throw new Error('HavenRouter not found in compiled output');
        }

        const contract = compiled.contracts[contractKey];

        return {
            abi: JSON.parse(contract.abi),
            bytecode: '0x' + contract.bin
        };
    } catch (error) {
        console.error('Compilation error:', error.message);
        return null;
    }
}

// Run deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Deployment failed:', error);
        process.exit(1);
    });

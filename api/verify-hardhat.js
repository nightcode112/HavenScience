import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const { contractAddress, contractType, constructorArgs } = req.body;

    console.log('[VerifyHardhat] Request received:', { contractAddress, contractType });

    if (!contractAddress || !contractType || !constructorArgs) {
      res.statusCode = 400;
      return res.end(JSON.stringify({
        error: 'Missing required fields: contractAddress, contractType, constructorArgs'
      }));
    }

    // Determine contract name (use flattened files for verification)
    let contractName;
    let sourceFile;

    if (contractType === 'BSC_HAVEN') {
      contractName = 'FullBondingCurveERC20XToken';
      sourceFile = 'BSC_HAVEN/FullBondingCurveERC20XToken_Flattened.sol';
    } else if (contractType === 'BSC_COMPATIBLE') {
      contractName = 'FullBondingCurveERC20WBNB';
      sourceFile = 'BSC_COMPATIBLE/FullBondingCurveERC20WBNB_Flattened.sol';
    } else {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Invalid contract type' }));
    }

    // Build constructor arguments
    const args = [
      constructorArgs.name,
      constructorArgs.symbol,
      constructorArgs.description,
      constructorArgs.imageUrl,
      constructorArgs.website || '',
      constructorArgs.twitter || '',
      constructorArgs.telegram || '',
      constructorArgs.creator,
      constructorArgs.factoryAddress,
      constructorArgs.graduationHelperAddress,
      constructorArgs.xTokenAddress,
      '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap Router
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    ];

    // Add bonding curve params
    const bondingParams = contractType === 'BSC_HAVEN'
      ? '4000000000000000000'   // 4 HAVEN
      : '17000000000000000000';  // 17 BNB

    args.push(
      bondingParams,                           // targetXTokens
      '3000000000000000000',                   // virtualXTokens
      '1073000000000000000000000000',          // virtualProjectTokens
      '1000000000000000000000000000',          // maxSupply
      '900000000000000000000000000',           // initialSupply
      '100000000000000000000000000'            // uniswapSupply
    );

    args.push(String(constructorArgs.creatorAllocationBps));

    console.log('[VerifyHardhat] Constructor args:', args);

    // Run Hardhat verify
    const xtokenDir = path.join(__dirname, '..', 'XTOKEN');

    // For verification, we'll use the flattened source directly via API
    // since Hardhat can't easily access files outside contracts/
    const hardhatArgs = [
      'verify',
      '--network', 'bsc',
      contractAddress,
      ...args
    ];

    console.log('[VerifyHardhat] Running: npx hardhat', hardhatArgs.join(' '));

    const hardhat = spawn('npx', ['hardhat', ...hardhatArgs], {
      cwd: xtokenDir,
      shell: true,
      env: {
        ...process.env,
        ETHERSCAN_API_KEY: process.env.BSCSCAN_API_KEY || process.env.ETHERSCAN_API_KEY
      }
    });

    let stdout = '';
    let stderr = '';

    hardhat.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('[VerifyHardhat]', output);
    });

    hardhat.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error('[VerifyHardhat]', output);
    });

    hardhat.on('close', (code) => {
      console.log('[VerifyHardhat] Process exited with code:', code);

      if (code === 0 || stdout.includes('Successfully verified') || stdout.includes('Already Verified')) {
        res.statusCode = 200;
        return res.end(JSON.stringify({
          success: true,
          message: 'Contract verified successfully',
          output: stdout,
          bscscanUrl: `https://bscscan.com/address/${contractAddress}#code`
        }));
      } else {
        res.statusCode = 400;
        return res.end(JSON.stringify({
          success: false,
          error: stderr || stdout || 'Verification failed',
          output: stdout,
          errorOutput: stderr
        }));
      }
    });

    // Set a timeout
    setTimeout(() => {
      hardhat.kill();
      res.statusCode = 408;
      return res.end(JSON.stringify({
        success: false,
        error: 'Verification timeout (60s)',
        output: stdout
      }));
    }, 60000);

  } catch (error) {
    console.error('[VerifyHardhat] Error:', error);
    res.statusCode = 500;
    return res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

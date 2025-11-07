import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// BSCScan API configuration (v2)
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || '1XKM574AI7C6BTKSA69VHMMGK13Q4XF9PN';
const BSCSCAN_API_URL = 'https://api.etherscan.io/v2/api'; // v2 endpoint with /v2/ path

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  // GET: Check verification status
  if (req.method === 'GET') {
    try {
      const guid = req.query?.guid;
      if (!guid) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing guid parameter' }));
      }

      const statusUrl = `${BSCSCAN_API_URL}?` + new URLSearchParams({
        apikey: BSCSCAN_API_KEY,
        chainid: '56',
        module: 'contract',
        action: 'checkverifystatus',
        guid: guid
      }).toString();

      const statusResponse = await fetch(statusUrl);
      const statusResult = await statusResponse.json();

      console.log('[Verify] Status check response:', statusResult);

      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        status: statusResult.result,
        message: statusResult.message
      }));
    } catch (error) {
      console.error('[Verify] Status check error:', error);
      res.statusCode = 500;
      return res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const { contractAddress, contractType, constructorArgs } = req.body;

    console.log('[Verify] Request received:', { contractAddress, contractType, constructorArgs });

    if (!contractAddress || !contractType || !constructorArgs) {
      res.statusCode = 400;
      return res.end(JSON.stringify({
        error: 'Missing required fields: contractAddress, contractType, constructorArgs',
        received: { contractAddress, contractType, hasConstructorArgs: !!constructorArgs }
      }));
    }

    // Validate constructorArgs has required fields
    const required = ['name', 'symbol', 'creator', 'factoryAddress'];
    const missing = required.filter(field => !constructorArgs[field]);
    if (missing.length > 0) {
      res.statusCode = 400;
      return res.end(JSON.stringify({
        error: `Missing required fields: ${missing.join(', ')}`,
        constructorArgs
      }));
    }

    // Read flattened source code based on contract type
    let sourceCode;
    let contractName;

    if (contractType === 'BSC_HAVEN') {
      const sourcePath = path.join(__dirname, '..', 'XTOKEN', 'BSC_HAVEN', 'FullBondingCurveERC20XToken_Flattened.sol');
      sourceCode = fs.readFileSync(sourcePath, 'utf8');
      contractName = 'FullBondingCurveERC20XToken';
    } else if (contractType === 'BSC_COMPATIBLE') {
      const sourcePath = path.join(__dirname, '..', 'XTOKEN', 'BSC_COMPATIBLE', 'FullBondingCurveERC20WBNB_Flattened.sol');
      sourceCode = fs.readFileSync(sourcePath, 'utf8');
      contractName = 'FullBondingCurveERC20WBNB';
    } else {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Invalid contract type' }));
    }

    // Encode constructor arguments
    const { default: Web3 } = await import('web3');
    const web3 = new Web3();

    // Constructor parameters for FullBondingCurveERC20XToken/WBNB
    const constructorTypes = [
      'string',   // name
      'string',   // symbol
      'bytes32',  // descriptionHash
      'bytes32',  // imageHash
      'bytes32',  // socialHash (keccak256 of website+twitter+telegram)
      'address',  // creator
      'address',  // factory
      'address',  // graduationHelper
      'address',  // xTokenAddress
      'address',  // uniswapV2Router
      'address',  // weth
      'tuple(uint256,uint256,uint256,uint256,uint256,uint256)', // BondingCurveParams
      'uint256'   // creatorAllocationBps
    ];

    // Helper to convert string to bytes32
    const stringToBytes32 = (str) => {
      const hex = Buffer.from(str.substring(0, 32), 'utf8').toString('hex').padEnd(64, '0');
      return '0x' + hex;
    };

    // Helper to hash social links (must match contract: abi.encodePacked)
    const hashSocial = (website, twitter, telegram) => {
      // encodePacked concatenates the raw string bytes without length prefixes
      const packed = (website || '') + (twitter || '') + (telegram || '');
      return web3.utils.keccak256(packed);
    };

    // Get bonding curve parameters from factory (these are immutable)
    const bondingParams = {
      targetXTokens: contractType === 'BSC_HAVEN' ? '4000000000000000000' : '17000000000000000000',
      virtualXTokens: '3000000000000000000',
      virtualProjectTokens: '1073000000000000000000000000',
      maxSupply: '1000000000000000000000000000',
      initialSupply: '900000000000000000000000000',
      uniswapSupply: '100000000000000000000000000'
    };

    // Ensure all addresses are strings and properly formatted
    const ensureAddress = (addr) => {
      if (!addr) throw new Error('Missing address');
      const addrStr = String(addr).toLowerCase();
      if (!addrStr.startsWith('0x')) return '0x' + addrStr;
      return addrStr;
    };

    const constructorArguments = [
      String(constructorArgs.name),
      String(constructorArgs.symbol),
      stringToBytes32(constructorArgs.description || ''),
      stringToBytes32(constructorArgs.imageUrl || ''),
      hashSocial(constructorArgs.website, constructorArgs.twitter, constructorArgs.telegram),
      ensureAddress(constructorArgs.creator),
      ensureAddress(constructorArgs.factoryAddress),
      ensureAddress(constructorArgs.graduationHelperAddress),
      ensureAddress(constructorArgs.xTokenAddress),
      '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap Router
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      [
        String(bondingParams.targetXTokens),
        String(bondingParams.virtualXTokens),
        String(bondingParams.virtualProjectTokens),
        String(bondingParams.maxSupply),
        String(bondingParams.initialSupply),
        String(bondingParams.uniswapSupply)
      ],
      String(constructorArgs.creatorAllocationBps)
    ];

    console.log('[Verify] Constructor arguments prepared:', {
      creator: constructorArguments[5],
      factory: constructorArguments[6],
      helper: constructorArguments[7],
      xToken: constructorArguments[8]
    });

    const encodedConstructorArgs = web3.eth.abi.encodeParameters(
      constructorTypes,
      constructorArguments
    ).slice(2); // Remove '0x' prefix

    console.log('[Verify] Encoded constructor args length:', encodedConstructorArgs.length);

    // Submit to BSCScan using v2 API
    // V2 API requires chainid parameter and uses query string format
    const verifyUrl = `${BSCSCAN_API_URL}?` + new URLSearchParams({
      apikey: BSCSCAN_API_KEY,
      chainid: '56', // BSC Mainnet - required for v2
      module: 'contract',
      action: 'verifysourcecode'
    }).toString();

    const verifyParams = new URLSearchParams({
      contractaddress: contractAddress,
      sourceCode: sourceCode,
      codeformat: 'solidity-single-file',
      contractname: contractName,
      compilerversion: 'v0.8.26+commit.8a97fa7a',
      optimizationUsed: '1',
      runs: '200',
      constructorArguements: encodedConstructorArgs,
      evmversion: 'paris',
      licenseType: '3'
    });

    console.log('[Verify] Submitting to:', verifyUrl);

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString()
    });

    const verifyResult = await verifyResponse.json();

    console.log('[Verify] BSCScan response:', verifyResult);

    if (verifyResult.status === '1') {
      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        message: 'Contract verification submitted',
        guid: verifyResult.result,
        bscscanUrl: `https://bscscan.com/address/${contractAddress}#code`
      }));
    } else {
      res.statusCode = 400;
      return res.end(JSON.stringify({
        success: false,
        error: verifyResult.result || 'Verification failed'
      }));
    }

  } catch (error) {
    console.error('[Verify] Error:', error);
    res.statusCode = 500;
    return res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

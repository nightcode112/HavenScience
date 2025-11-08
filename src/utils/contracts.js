import FactoryAbi from '../contracts/abis/FullBondingCurveFactoryXToken.json'
import TokenAbi from '../contracts/abis/FullBondingCurveERC20XToken.json'
import FactoryWBNBAbi from '../contracts/abis/FullBondingCurveFactoryWBNB.json'
import TokenWBNBAbi from '../contracts/abis/FullBondingCurveERC20WBNB.json'
import HavenRouterAbi from '../contracts/abis/HavenRouter.json'
import HavenRouterV2Abi from '../contracts/abis/HavenRouterV2.json'
import TokenPredictorAbi from '../contracts/abis/TokenAddressPredictor.json'

// BSC Mainnet Deployed Contract Addresses

// BSC_HAVEN Contracts (Haven Token Pair) - DEFAULT
const HAVEN_FACTORY_ADDRESS = '0xA82E806F3aee4C0e306fB4d989354F9e43Ff7dE4'
const HAVEN_GRADUATION_HELPER = '0x7DaeDEBDeDCEDc1ce661F5d7bC7e4d801Ff08Bc2'
const HAVEN_TOKEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
const HAVEN_TOKEN_PREDICTOR = '0x8a9cA2aC69c1E9bc6D5b74C98E3e03bECE12e27A'

// BSC_COMPATIBLE Contracts (BNB/WBNB Pair)
const BNB_FACTORY_ADDRESS = '0xaD6D411363b4271E30D84db226482Cd4B88eF428'
const BNB_GRADUATION_HELPER = '0x1AD23aEf94bBeD915a0F536E23B47ff773Daf218'
const BNB_TOKEN_DEPLOYER_LIB = '0x00e2401a6C3d220e258B4998ebCF1D199b379a55'
const BNB_TOKEN_PREDICTOR = '0x2DAbdb4235588608a64c97a3017Bf6E62C526017'

// Shared Infrastructure
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const PANCAKESWAP_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
const PANCAKESWAP_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'

// HavenRouter - supports both HAVEN and WBNB bonding curves
const HAVEN_ROUTER_ADDRESS = import.meta.env.VITE_HAVEN_ROUTER_ADDRESS || '0xd5c4F008823D491eA6FE00D32916224226d7c84d'
const HAVEN_ROUTER_V2_ADDRESS = import.meta.env.VITE_HAVEN_ROUTER_V2_ADDRESS || '0x26e442d47529091dd5e41c8e08c729cf4ee9f95d'

export const CONTRACTS = {
  // Haven Pair Contracts (DEFAULT)
  haven: {
    factory: {
      address: HAVEN_FACTORY_ADDRESS,
      abi: FactoryAbi,
    },
    token: {
      abi: TokenAbi,
    },
    graduationHelper: {
      address: HAVEN_GRADUATION_HELPER,
    },
    xtoken: {
      address: HAVEN_TOKEN_ADDRESS,
    },
    predictor: {
      address: HAVEN_TOKEN_PREDICTOR,
      abi: TokenPredictorAbi,
    },
  },
  // BNB Pair Contracts
  bnb: {
    factory: {
      address: BNB_FACTORY_ADDRESS,
      abi: FactoryWBNBAbi,
    },
    token: {
      abi: TokenWBNBAbi,
    },
    graduationHelper: {
      address: BNB_GRADUATION_HELPER,
    },
    tokenDeployerLib: {
      address: BNB_TOKEN_DEPLOYER_LIB,
    },
    xtoken: {
      address: WBNB_ADDRESS, // WBNB is the xtoken for BNB pairs
    },
    predictor: {
      address: BNB_TOKEN_PREDICTOR,
      abi: TokenPredictorAbi,
    },
  },
  // Shared/Legacy (for backward compatibility)
  factory: {
    address: HAVEN_FACTORY_ADDRESS, // Default to Haven
    abi: FactoryAbi,
  },
  token: {
    abi: TokenAbi,
  },
  xtoken: {
    address: HAVEN_TOKEN_ADDRESS, // Default to Haven
  },
  routerV2: {
    address: PANCAKESWAP_ROUTER,
  },
  wbnb: {
    address: WBNB_ADDRESS,
  },
  havenRouter: {
    address: HAVEN_ROUTER_ADDRESS,
    abi: HavenRouterAbi,
  },
  havenRouterV2: {
    address: HAVEN_ROUTER_V2_ADDRESS,
    abi: HavenRouterV2Abi, // Using HavenRouterV2 ABI (supports both token types)
  },
}

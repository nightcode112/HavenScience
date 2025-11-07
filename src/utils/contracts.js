import FactoryAbi from '../contracts/abis/FullBondingCurveFactoryXToken.json'
import TokenAbi from '../contracts/abis/FullBondingCurveERC20XToken.json'
import FactoryWBNBAbi from '../contracts/abis/FullBondingCurveFactoryWBNB.json'
import TokenWBNBAbi from '../contracts/abis/FullBondingCurveERC20WBNB.json'
import HavenRouterAbi from '../contracts/abis/HavenRouter.json'
import HavenRouterV2Abi from '../contracts/abis/HavenRouterV2.json'
import TokenPredictorAbi from '../contracts/abis/TokenAddressPredictor.json'

// BSC Mainnet Deployed Contract Addresses

// BSC_HAVEN Contracts (Haven Token Pair) - DEFAULT
const HAVEN_FACTORY_ADDRESS = '0x1F9592f6d9F5E0BB74f33E0383490889ff273d0F'
const HAVEN_GRADUATION_HELPER = '0xa712C4cAf86Db9A081B01cc6BC2E161Ad4facde5'
const HAVEN_TOKEN_ADDRESS = '0x3c06AF089F1188c8357b29bDf9f98B36E51f7690'
const HAVEN_TOKEN_PREDICTOR = '0x3652bb6275AE44603e0155F55298D5B1004D3151'

// BSC_COMPATIBLE Contracts (BNB/WBNB Pair)
const BNB_FACTORY_ADDRESS = '0xACa75645477cc778Fea1F4676F13DcB4002a7A55'
const BNB_GRADUATION_HELPER = '0xBBe87C5EA93D62f97564f8c00f8C22729Af502Ab'
const BNB_TOKEN_DEPLOYER_LIB = '0x1a581B32f0d2788f0ec25a4683A891e91Df988ba'
const BNB_TOKEN_PREDICTOR = '0x00d07083292f830905E97eDE6E76286299C436C8'

// Shared Infrastructure
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const PANCAKESWAP_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
const PANCAKESWAP_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'

// HavenRouter - supports both HAVEN and WBNB bonding curves
const HAVEN_ROUTER_ADDRESS = import.meta.env.VITE_HAVEN_ROUTER_ADDRESS || '0xd5c4F008823D491eA6FE00D32916224226d7c84d'
const HAVEN_ROUTER_V2_ADDRESS = import.meta.env.VITE_HAVEN_ROUTER_V2_ADDRESS || '0xd5c4F008823D491eA6FE00D32916224226d7c84d'

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

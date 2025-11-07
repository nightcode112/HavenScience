# HavenRouter Contract

A fully configurable router contract that enables single-transaction BNB → Project Token purchases for Haven bonding curve tokens.

## Features

### Core Functionality
- ✅ **Single Transaction Buying**: Buy bonding curve tokens with BNB in one transaction
- ✅ **Exact Output Support**: Buy exact amount of tokens with automatic BNB refund
- ✅ **Price Previews**: View estimated costs before executing
- ✅ **Slippage Protection**: Configurable slippage tolerance
- ✅ **Fully Configurable**: All parameters can be updated by owner

### Security Features
- ✅ **Pause Mechanism**: Emergency pause for all operations
- ✅ **Emergency Withdraw**: Recover stuck tokens
- ✅ **Custom Errors**: Gas-efficient error handling
- ✅ **Slippage Limits**: Maximum slippage protection
- ✅ **Ownership Transfer**: Secure ownership management

## How It Works

### `buyBondingCurveTokenWithBNB()`
**Single transaction flow:**
1. User sends BNB to router
2. Router swaps BNB → HAVEN on PancakeSwap
3. Router approves HAVEN for bonding curve
4. Router buys project tokens from bonding curve
5. Router transfers project tokens to user

**Parameters:**
- `bondingCurveToken`: Address of the project token to buy
- `minTokensOut`: Minimum tokens to receive (slippage protection)

**Example:**
```javascript
const tx = await havenRouter.buyBondingCurveTokenWithBNB(
  "0x85E1De6Ee483d1001880adF992ab64007A794242", // Token address
  ethers.parseEther("1000"), // Min 1000 tokens
  { value: ethers.parseEther("0.1") } // Send 0.1 BNB
);
```

### `buyExactTokensWithBNB()`
**Buy exact amount of tokens with BNB refund:**
1. Calculates required HAVEN for exact tokens
2. Calculates required BNB for HAVEN (with slippage buffer)
3. Executes swap and bonding curve buy
4. Refunds excess BNB to user

**Parameters:**
- `bondingCurveToken`: Address of the project token
- `exactTokensOut`: Exact amount of tokens to receive
- `maxSlippageBps`: Maximum slippage in basis points (100 = 1%)

**Example:**
```javascript
const tx = await havenRouter.buyExactTokensWithBNB(
  "0x85E1De6Ee483d1001880adF992ab64007A794242", // Token address
  ethers.parseEther("1000"), // Exactly 1000 tokens
  500, // 5% max slippage
  { value: ethers.parseEther("0.2") } // Send 0.2 BNB (excess refunded)
);
```

## Preview Functions

### `previewBuyWithBNB()`
Preview how many tokens you'll get for a BNB amount:
```javascript
const [tokensOut, havenAmount] = await havenRouter.previewBuyWithBNB(
  tokenAddress,
  ethers.parseEther("0.1") // 0.1 BNB
);
console.log(`0.1 BNB = ${ethers.formatEther(tokensOut)} tokens`);
```

### `previewExactBuyWithBNB()`
Preview how much BNB needed for exact tokens:
```javascript
const [bnbRequired, havenRequired] = await havenRouter.previewExactBuyWithBNB(
  tokenAddress,
  ethers.parseEther("1000") // 1000 tokens
);
console.log(`1000 tokens costs ${ethers.formatEther(bnbRequired)} BNB`);
```

## Configuration

All configuration functions are owner-only:

### Update Addresses
```solidity
setPancakeRouter(address _pancakeRouter)
setHavenToken(address _havenToken)
setWBNB(address _wbnb)
```

### Update Parameters
```solidity
setDefaultDeadlineOffset(uint256 _offset) // Default: 300 seconds
setMaxSlippage(uint256 _maxSlippageBps)   // Default: 5000 (50%)
```

### Emergency Controls
```solidity
setPaused(bool _paused)                   // Pause/unpause
emergencyWithdraw(token, to, amount)      // Recover stuck funds
transferOwnership(address newOwner)       // Transfer ownership
```

## Deployment

### Prerequisites
1. Install Solidity compiler:
```bash
npm install -g solc
```

2. Set deployer private key:
```bash
export DEPLOYER_PRIVATE_KEY="0x..."
```

### Deploy to BSC
```bash
node contracts/deploy-router.js
```

### Verify on BSCScan
```bash
npx hardhat verify --network bsc <ROUTER_ADDRESS> \
  0x10ED43C718714eb63d5aA57B78B54704E256024E \
  0x3c06AF089F1188c8357b29bDf9f98B36E51f7690 \
  0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
```

## Frontend Integration

### 1. Import ABI
```javascript
import HavenRouterAbi from './contracts/abis/HavenRouter.json'
```

### 2. Update Contract Config
```javascript
export const CONTRACTS = {
  // ... existing contracts
  havenRouter: {
    address: '0x...', // Router address from deployment
    abi: HavenRouterAbi,
  }
}
```

### 3. Update Buy Logic
```javascript
// For bonding curve tokens with BNB
if (displayCurrency === 'BNB' && !isGraduated) {
  // Use router instead of 2 separate transactions
  const routerSim = await simulateContract(wagmiConfig, {
    abi: CONTRACTS.havenRouter.abi,
    address: CONTRACTS.havenRouter.address,
    functionName: 'buyBondingCurveTokenWithBNB',
    args: [tokenAddress, minTokensOut],
    value: bnbAmount
  })

  const hash = await writeContract(wagmiConfig, routerSim.request)
  await waitForTransactionReceipt(wagmiConfig, { hash })

  showModal('success', 'Purchase Successful!',
    `Successfully bought tokens via BNB → HAVEN → ${tokenLabel}!`)
}
```

## Events

The contract emits events for tracking:

```solidity
event BuyExecuted(
    address indexed user,
    address indexed bondingCurveToken,
    uint256 bnbIn,
    uint256 havenSwapped,
    uint256 tokensOut
);

event ExactBuyExecuted(
    address indexed user,
    address indexed bondingCurveToken,
    uint256 bnbIn,
    uint256 bnbRefunded,
    uint256 tokensOut
);

event ConfigUpdated(
    address indexed updater,
    string parameter,
    uint256 oldValue,
    uint256 newValue
);

event AddressUpdated(
    address indexed updater,
    string parameter,
    address oldAddress,
    address newAddress
);
```

## Gas Estimates

Approximate gas costs on BSC:
- `buyBondingCurveTokenWithBNB`: ~250,000 gas
- `buyExactTokensWithBNB`: ~280,000 gas (includes refund)
- Preview functions: ~100,000 gas (read-only)

At 3 gwei: ~$0.05-0.10 per transaction

## Security Considerations

1. **Contract is not upgradeable** - Deploy carefully
2. **Owner has significant power** - Use multisig for mainnet
3. **No token whitelisting** - Any bonding curve can be used
4. **Price impact** - Large buys may have high slippage
5. **Front-running** - Use appropriate slippage tolerance

## Testing

### Test on BSC Testnet
1. Deploy router to testnet
2. Use testnet tokens and BNB
3. Test both buy functions
4. Verify refunds work correctly
5. Test emergency functions

### Test Cases
- [ ] Buy with exact BNB input
- [ ] Buy exact tokens with BNB (with refund)
- [ ] Slippage protection works
- [ ] Pause mechanism works
- [ ] Emergency withdraw works
- [ ] Configuration updates work
- [ ] Preview functions accurate

## Troubleshooting

### "SlippageExceeded" error
- Increase `minTokensOut` or send more BNB
- Check for high price volatility

### "InsufficientOutput" error
- Market moved unfavorably
- Increase slippage tolerance

### "TransferFailed" error
- Check token approvals
- Verify bonding curve supports buys
- Check if bonding curve is graduated

### Transaction reverts with no error
- Verify addresses are correct
- Check BNB balance
- Ensure contract is not paused

## Support

For issues or questions:
1. Check BSCScan for transaction details
2. Review contract events
3. Verify configuration is correct
4. Test with small amounts first

## License

MIT License - See contract header for details

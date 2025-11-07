# HavenScience Development Guidelines

This document outlines the development standards and best practices for contributing to the HavenScience project.

## Technology Stack

- **Blockchain**: BNB Smart Chain + EVM-compatible chains
- **Smart Contracts**: Solidity ^0.8.20
- **Frontend**: React 19 + Vite + ethers.js v6 + wagmi + RainbowKit
- **Development**: Hardhat, OpenZeppelin libraries
- **Database**: Supabase (PostgreSQL)
- **Real-time**: WebSocket-based indexing with PM2

## Development Environment Setup

### Required Tools

1. **Node.js**: Version 18.x or higher
2. **npm**: Version 8.x or higher
3. **Git**: Latest version
4. **Code Editor**: VS Code recommended

### Environment Variables

Never commit `.env` files to the repository. Always use `.env.example` as a template. Required variables:

```env
# Network
VITE_BSC_RPC_URL=           # Your BSC RPC endpoint
BSC_PRIVATE_KEY=            # For contract deployment (keep secure!)

# Contracts
VITE_FACTORY_ADDRESS=       # Factory contract address
VITE_XTOKEN_ADDRESS=        # HAVEN token address
VITE_ROUTER_V2_ADDRESS=     # PancakeSwap V2 router
VITE_WBNB_ADDRESS=          # Wrapped BNB address

# Services
VITE_SUPABASE_URL=          # Supabase project URL
VITE_SUPABASE_KEY=          # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=  # For backend operations
VITE_WALLETCONNECT_PROJECT_ID=  # WalletConnect project ID

# APIs
BSCSCAN_API_KEY=            # For contract verification
```

## Code Standards

### Smart Contracts

1. **Solidity Version**: Always use `^0.8.20`
2. **Imports**: Use OpenZeppelin for standard implementations
3. **Security**:
   - Add reentrancy guards to all state-changing functions
   - Use `SafeERC20` for token transfers
   - Implement access control with OpenZeppelin's `Ownable` or `AccessControl`
4. **Gas Optimization**:
   - Use `calldata` for read-only function parameters
   - Pack storage variables efficiently
   - Minimize storage reads/writes
5. **Documentation**: Add NatSpec comments to all public functions

Example:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ExampleContract
 * @notice This contract does X
 * @dev Implementation details
 */
contract ExampleContract is ReentrancyGuard {
    /**
     * @notice Performs action X
     * @param amount The amount to process
     * @return success Whether operation succeeded
     */
    function doSomething(uint256 amount) external nonReentrant returns (bool success) {
        // Implementation
    }
}
```

### JavaScript/React

1. **Modern JavaScript**: Use ES6+ features
2. **React Hooks**: Prefer functional components with hooks
3. **Async/Await**: Use instead of promises chains
4. **Error Handling**: Always wrap async calls in try/catch
5. **Comments**: Add comments for complex logic only

Example:
```javascript
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

export function TokenPrice({ tokenAddress }) {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPrice() {
      try {
        const response = await fetch(`/api/token-price/${tokenAddress}`);
        if (!response.ok) throw new Error('Failed to fetch price');
        const data = await response.json();
        setPrice(data.price);
      } catch (error) {
        console.error('Error fetching price:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPrice();
  }, [tokenAddress]);

  if (loading) return <div>Loading...</div>;
  return <div>${price}</div>;
}
```

### File Naming

- **Components**: PascalCase (e.g., `TokenCard.jsx`)
- **Utilities**: camelCase (e.g., `formatPrice.js`)
- **Contracts**: PascalCase (e.g., `BondingCurveFactory.sol`)
- **Scripts**: kebab-case (e.g., `realtime-indexer.js`)

## Git Workflow

### Branch Naming

- `main` - Production-ready code
- `develop` - Development branch
- `feature/<name>` - New features
- `fix/<name>` - Bug fixes
- `hotfix/<name>` - Critical production fixes

### Commit Messages

Use clear, descriptive commit messages:

```
✅ Good:
- "Add bonding curve graduation logic"
- "Fix price calculation for BNB pairs"
- "Update token creation fee structure"

❌ Bad:
- "update"
- "fix bug"
- "changes"
```

### Pull Requests

1. Keep PRs focused on a single feature/fix
2. Include description of changes
3. Test thoroughly before submitting
4. Ensure all tests pass
5. Request review from team members

## Testing

### Smart Contracts

```bash
# Run Hardhat tests
npx hardhat test

# Run specific test file
npx hardhat test test/BondingCurve.test.js

# Check coverage
npx hardhat coverage
```

### Frontend

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

### Smart Contracts

1. **Test on BSC Testnet first**
```bash
npx hardhat run scripts/deploy.js --network bscTestnet
```

2. **Verify contract on BSCScan**
```bash
npx hardhat verify --network bsc <ADDRESS> <CONSTRUCTOR_ARGS>
```

3. **Update contract addresses in `.env`**

### Frontend

1. **Build production bundle**
```bash
npm run build
```

2. **Deploy to Vercel**
```bash
vercel --prod
```

3. **Set environment variables in Vercel dashboard**

### Indexer

1. **Deploy to production server**
```bash
scp -r scripts/ user@server:/path/to/scripts
```

2. **Setup PM2**
```bash
pm2 start realtime-indexer.js --name realtime-indexer
pm2 startup
pm2 save
```

## Security Best Practices

### Smart Contracts

- ✅ Use latest OpenZeppelin contracts
- ✅ Add reentrancy guards
- ✅ Validate all inputs
- ✅ Use SafeMath (built-in in 0.8+)
- ✅ Implement emergency pause mechanisms
- ❌ Never use `tx.origin` for authentication
- ❌ Avoid floating pragma versions
- ❌ Don't hardcode addresses

### API Keys

- ✅ Store in environment variables
- ✅ Use different keys for dev/prod
- ✅ Rotate keys regularly
- ✅ Use service role keys only on backend
- ❌ Never commit keys to git
- ❌ Never expose service keys in frontend
- ❌ Never share keys in public channels

### Frontend

- ✅ Validate user inputs
- ✅ Sanitize data before display
- ✅ Use HTTPS only
- ✅ Implement rate limiting
- ❌ Don't trust client-side data
- ❌ Never store private keys
- ❌ Don't execute user-provided code

## Database Schema

### Supabase Tables

Key tables:
- `tokens` - Token information
- `token_stats` - Real-time statistics
- `trades` - Trade history
- `creator_fees` - Fee collection records
- `robots` - AI agent configurations

Always use Row Level Security (RLS) policies on sensitive tables.

## API Endpoints

### Naming Convention

- Use kebab-case for URLs
- Use RESTful principles
- Include API version if needed

```
✅ Good:
/api/tokens/{address}
/api/token-stats/{address}
/api/trade-history/{address}

❌ Bad:
/api/getToken/{address}
/api/TokenStats/{address}
/api/trades_history/{address}
```

### Error Handling

Always return consistent error responses:

```javascript
{
  "error": "Token not found",
  "code": "TOKEN_NOT_FOUND",
  "status": 404
}
```

## Performance Optimization

### Frontend

1. **Code Splitting**: Use dynamic imports for large components
2. **Lazy Loading**: Load images and heavy components on demand
3. **Memoization**: Use `useMemo` and `useCallback` for expensive operations
4. **Debouncing**: Debounce search inputs and API calls

### Smart Contracts

1. **Gas Optimization**: Minimize storage operations
2. **Batch Operations**: Allow bulk operations when possible
3. **Events**: Use events instead of storage for historical data

### Database

1. **Indexes**: Add indexes on frequently queried columns
2. **Caching**: Cache frequently accessed data
3. **Pagination**: Always paginate large result sets

## Monitoring & Logging

### Production Monitoring

- PM2 for process management
- Check logs regularly: `pm2 logs`
- Monitor gas prices and adjust
- Track failed transactions

### Error Logging

Always log errors with context:

```javascript
try {
  await someOperation();
} catch (error) {
  console.error('Error in someOperation:', {
    error: error.message,
    stack: error.stack,
    context: { userId, tokenAddress }
  });
}
```

## Support

For questions about these guidelines, contact the development team on Telegram.

## Updates

These guidelines are subject to change. Last updated: January 2025

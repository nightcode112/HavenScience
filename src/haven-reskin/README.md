# Haven Reskin Components

This folder contains reskinned components from the original Haven project, adapted for use in HavenScience with Haven's color scheme and design language.

## Color Theme

The reskin uses Haven's signature color palette:

- **Primary**: `#5854f4` (Vibrant Blue/Purple)
- **Primary Hover**: `#4c46e8`
- **Primary Light**: `#7c7cf6`
- **Background**: `#0f1419` (Dark)
- **Surface**: `#1a1f2e` (Elevated Dark)
- **Elevated**: `#252d3f` (More Elevated)
- **Border**: `#374151` (Gray Border)

## Components Included

### 1. HavenHeader.jsx
A navigation header component styled with Haven's colors and branding.

**Features:**
- Responsive design with mobile menu
- Search functionality
- Haven logo integration
- Wallet connection support via RainbowKit
- Navigation items: Discover, Pulse, Trackers, Portfolio, Rewards

**Usage:**
```jsx
import HavenHeader from './haven-reskin/components/HavenHeader'

function App() {
  return (
    <>
      <HavenHeader />
      {/* Your content */}
    </>
  )
}
```

### 2. HavenPulse.jsx
A three-column layout displaying categorized robots (tokens) with real-time data.

**Features:**
- Three-column layout: New Robots, Almost Graduated, Graduated
- Search and filter functionality
- Quick buy buttons with customizable amounts
- Real-time stats display (volume, market cap, holders, etc.)
- Token/Robot metadata display with social links

**Usage:**
```jsx
import HavenPulse from './haven-reskin/pages/HavenPulse'

function PulsePage() {
  const robots = [] // Your robots data

  return <HavenPulse robots={robots} />
}
```

**Data Format:**
```javascript
const robot = {
  id: '1',
  address: '0x...',
  contractAddress: '0x...',
  symbol: 'ROBO',
  name: 'Robot Token',
  description: 'A cool robot',
  timestamp: 1234567890,
  marketCap: 100000,
  volume24h: 10000,
  holdersCount: 150,
  twitter: 'https://twitter.com/...',
  telegram: 'https://t.me/...',
  website: 'https://...',
  progress: 85, // Bonding curve progress %
  isGraduated: false,
  // Metadata
  devCreated: 5,
  devGraduated: 3,
  devHolds: 10,
  top10Holds: 45,
  phishingHolds: 0,
  snipersHold: 5,
  insidersHold: 8,
  netBuy1m: 2.5
}
```

### 3. HavenTokenDetail.jsx
A detailed view for individual robots/tokens with trading interface.

**Features:**
- Token information header with stats
- Bonding curve progress indicator
- Buy/Sell interface with market/limit orders
- Price change indicators (5m, 1h, 6h, 24h)
- Security and holder statistics
- Trade history tabs
- Favorite/bookmark functionality

**Usage:**
```jsx
import HavenTokenDetail from './haven-reskin/pages/HavenTokenDetail'

function TokenPage() {
  const robot = {} // Your robot data

  return (
    <HavenTokenDetail
      robot={robot}
      onClose={() => navigate('/pulse')}
    />
  )
}
```

## Integration with HavenScience

### Option 1: Replace Existing Components

Replace your existing Marketplace or robot list view with HavenPulse:

```jsx
// In App.jsx or your routing file
import HavenPulse from './haven-reskin/pages/HavenPulse'

// Replace:
// <Route path="/" element={<Marketplace />} />

// With:
<Route path="/" element={<HavenPulse robots={robotsData} />} />
```

### Option 2: Add as New Routes

Add the reskinned components as new pages:

```jsx
import HavenHeader from './haven-reskin/components/HavenHeader'
import HavenPulse from './haven-reskin/pages/HavenPulse'
import HavenTokenDetail from './haven-reskin/pages/HavenTokenDetail'

function App() {
  return (
    <Router>
      <HavenHeader />
      <Routes>
        <Route path="/pulse" element={<HavenPulse robots={robotsData} />} />
        <Route path="/market/:address" element={<HavenTokenDetail />} />
        {/* Keep existing routes */}
      </Routes>
    </Router>
  )
}
```

### Option 3: Gradual Migration

Use the new header while keeping existing pages:

```jsx
import HavenHeader from './haven-reskin/components/HavenHeader'

function App() {
  return (
    <>
      <HavenHeader />
      {/* Your existing routes and components */}
    </>
  )
}
```

## Styling Notes

1. **Tailwind CSS**: The components use inline styles for Haven colors but work with Tailwind classes
2. **Glass Effect**: Some components use backdrop blur effects - ensure your CSS supports this
3. **Gradients**: Haven's primary color is used in gradients throughout for consistency
4. **Dark Theme**: All components are designed for dark mode by default

## Customization

To customize colors, edit the `HAVEN_COLORS` constant at the top of each component:

```javascript
const HAVEN_COLORS = {
  primary: '#5854f4',      // Change to your brand color
  primaryHover: '#4c46e8',
  primaryLight: '#7c7cf6',
  // ... other colors
}
```

## Dependencies

These components require:
- React 18+
- React Router v6
- @rainbow-me/rainbowkit (for wallet connection)
- wagmi (for Web3 integration)
- lucide-react (for icons)
- Tailwind CSS (recommended but not required)

## Notes

- All components are responsive and mobile-friendly
- The components use TypeScript types but are written in JSX
- Search functionality is implemented but may need backend integration
- Trading functions are placeholder - implement with your contract logic
- Chart areas are placeholders - integrate with your preferred charting library

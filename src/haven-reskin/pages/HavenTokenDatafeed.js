// Custom datafeed for Haven token charts
// Uses bonding curve trades data instead of external APIs

export function createHavenTokenDatafeed(supabase, address, tokenData, displayModeRef, currencyRef, bnbPriceRef) {
  let cachedBars = new Map(); // Cache bars by resolution
  let cachedTrades = null;
  let lastFetchTime = 0;
  const CACHE_DURATION = 5000;
  const totalSupply = tokenData?.total_supply || tokenData?.totalSupply || 1000000;
  const HAVEN_TOKEN = '0x56a5c1da966b62c044819db2ce1915e8853ac527';

  // Store real-time subscribers
  const realtimeSubscribers = new Map();

  const fetchTradesAndConvert = async (resolution = '1') => {
    const now = Date.now();
    // Read current values from refs
    const displayMode = displayModeRef.current;
    const currency = currencyRef.current;
    const bnbPrice = bnbPriceRef.current;
    const cacheKey = `${resolution}_${displayMode}_${currency}`;


    // Check if we have cached bars for this resolution/mode/currency combo
    if (cachedBars.has(cacheKey) && now - lastFetchTime < CACHE_DURATION) {
      const cached = cachedBars.get(cacheKey);
      return cached;
    }

    try {

      const { data: bondingTrades, error: bondingError } = await supabase
        .from('trades')
        .select('*')
        .ilike('contract', address)
        .order('timestamp', { ascending: true });


      let dexSwapsQuery = supabase
        .from('swaps')
        .select('*')
        .ilike('token_address', address);

      // Filter by HAVEN pool for graduated tokens
      if (tokenData?.is_graduated && tokenData?.uniswap_pool_address) {
        dexSwapsQuery = dexSwapsQuery.ilike('pair_address', tokenData.uniswap_pool_address);
      }

      const { data: dexSwaps, error: swapsError } = await dexSwapsQuery
        .order('timestamp', { ascending: true });


      const { data: havenPriceSnapshots } = await supabase
        .from('price_snapshots')
        .select('*')
        .ilike('token_address', HAVEN_TOKEN)
        .order('timestamp', { ascending: true });

      const havenPrices = havenPriceSnapshots || [];
      const defaultHavenPrice = 0.91;

      function getHavenPriceAtTime(timestamp) {
        if (havenPrices.length === 0) return defaultHavenPrice;
        if (havenPrices.length === 1) return parseFloat(havenPrices[0].price);

        const targetTime = new Date(timestamp).getTime();
        let before = havenPrices[0];
        let after = havenPrices[havenPrices.length - 1];

        for (let i = 0; i < havenPrices.length - 1; i++) {
          const currentTime = new Date(havenPrices[i].timestamp).getTime();
          const nextTime = new Date(havenPrices[i + 1].timestamp).getTime();

          if (targetTime >= currentTime && targetTime <= nextTime) {
            before = havenPrices[i];
            after = havenPrices[i + 1];
            break;
          }
        }

        const beforeTime = new Date(before.timestamp).getTime();
        const afterTime = new Date(after.timestamp).getTime();
        const ratio = (targetTime - beforeTime) / (afterTime - beforeTime);
        return parseFloat(before.price) + ratio * (parseFloat(after.price) - parseFloat(before.price));
      }

      // Fetch market cap history from Supabase (for bonding curve market cap)
      let marketCapHistory = [];
      try {
        const { data, error } = await supabase
          .from('marketcap_data')
          .select('timestamp, marketcap_usd')
          .ilike('contract', address)
          .order('timestamp', { ascending: true });

        if (error) {
        } else {
          marketCapHistory = data || [];
        }
      } catch (fetchError) {
      }

      // Helper function to find market cap at a specific timestamp
      function getMarketCapAtTime(timestamp) {
        if (!marketCapHistory || marketCapHistory.length === 0) return null;

        // Find the closest market cap data point at or before this timestamp
        // If no entry exists before, take the first available entry (within 5 seconds tolerance)
        const targetSeconds = Math.floor(timestamp);
        let closestMcap = null;

        for (let i = 0; i < marketCapHistory.length; i++) {
          const mcapSeconds = Math.floor(marketCapHistory[i].timestamp);

          if (mcapSeconds <= targetSeconds) {
            closestMcap = parseFloat(marketCapHistory[i].marketcap_usd);
          } else {
            // If we haven't found any entry yet and this entry is very close (within 5 seconds),
            // use it as a fallback (handles case where first trade is slightly before first mcap entry)
            if (closestMcap === null && mcapSeconds - targetSeconds <= 5) {
              closestMcap = parseFloat(marketCapHistory[i].marketcap_usd);
            }
            break;
          }
        }

        return closestMcap;
      }

      const allTrades = [];

      // Process bonding curve trades
      if (bondingTrades && bondingTrades.length > 0) {
        bondingTrades.forEach(trade => {
          // Bonding curve trades use ethIn/tokensOut for buys, tokensIn/ethOut for sells
          const ethAmount = parseFloat(trade.ethIn || trade.ethOut || 0);
          const tokenAmount = parseFloat(trade.tokensOut || trade.tokensIn || 0);

          if (ethAmount > 0 && tokenAmount > 0) {
            // ETH is essentially HAVEN in the bonding curve
            const havenPriceUSD = getHavenPriceAtTime(trade.timestamp);
            const priceInHaven = ethAmount / tokenAmount; // Price in ETH (HAVEN)
            const priceUSD = priceInHaven * havenPriceUSD;

            allTrades.push({
              timestamp: trade.timestamp,
              priceUSD: priceUSD,
              tokenAmount: tokenAmount,
              source: 'bonding' // Mark as bonding curve trade
            });
          }
        });
      }

      // Process DEX swaps (post-graduation)
      if (dexSwaps && dexSwaps.length > 0) {
        const beforeCount = allTrades.length;
        dexSwaps.forEach(swap => {
          const tokenAmount = parseFloat(swap.token_amount || 0) / 1e18;

          if (tokenAmount > 0) {
            // Use pre-calculated price_usd from swaps table (already correct!)
            const priceUSD = parseFloat(swap.price_usd || 0);

            allTrades.push({
              timestamp: swap.timestamp,
              priceUSD: priceUSD,
              tokenAmount: Math.abs(tokenAmount), // Use absolute value for volume
              source: 'dex' // Mark as DEX trade
            });
          }
        });
      }


      allTrades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (allTrades.length === 0) {
        let initialValue = tokenData?.price || 0.0000188;
        if (displayMode === 'mcap') initialValue = initialValue * totalSupply;
        if (currency === 'bnb') initialValue = initialValue / bnbPrice;

        const nowMs = Date.now();
        return [
          { time: nowMs - 600000, open: initialValue, high: initialValue, low: initialValue, close: initialValue, volume: 0 },
          { time: nowMs - 300000, open: initialValue, high: initialValue, low: initialValue, close: initialValue, volume: 0 },
          { time: nowMs, open: initialValue, high: initialValue, low: initialValue, close: initialValue, volume: 0 }
        ];
      }

      // Convert resolution to milliseconds
      let intervalMinutes = 1;
      if (resolution === '1D') {
        intervalMinutes = 1440; // 24 hours
      } else {
        intervalMinutes = parseInt(resolution) || 1;
      }
      const INTERVAL_MS = intervalMinutes * 60 * 1000;

      // TRADE-BASED CANDLES (like test-working-chart.html and Axiom/GMGN)
      // Each candle shows price movement from previous close to current trade price
      // This creates visible candles showing actual price changes

      const barMap = new Map();
      let previousClose = null;

      allTrades.forEach(trade => {
        // Convert timestamp to Unix seconds
        // trade.timestamp can be either ISO string ('2025-10-29T21:48:18+00:00') or Unix timestamp
        let tradeTimeSeconds;

        if (typeof trade.timestamp === 'string') {
          // ISO 8601 string - convert to Unix timestamp in seconds
          tradeTimeSeconds = Math.floor(new Date(trade.timestamp).getTime() / 1000);
        } else {
          // Already a Unix timestamp in seconds
          tradeTimeSeconds = Math.floor(trade.timestamp);
        }

        // Validate timestamp
        if (!trade.timestamp || isNaN(tradeTimeSeconds) || tradeTimeSeconds <= 0) {
          return;
        }

        const tradeTimeMs = tradeTimeSeconds * 1000;

        // Round to bar interval
        const barTimeMs = Math.floor(tradeTimeMs / INTERVAL_MS) * INTERVAL_MS;

        // Calculate display value (matching test-working-chart.html logic exactly)
        // Return RAW values - do NOT multiply by pricescale
        let displayValue;

        if (displayMode === 'mcap') {
          // For market cap calculation:
          // - Bonding curve (source='bonding'): Use backend market cap data (correct bonding curve formula)
          // - DEX (source='dex'): Calculate from price × total_supply
          let marketCapUSD = null;

          if (trade.source === 'bonding') {
            // Use backend market cap for bonding curve trades
            const backendMarketCap = getMarketCapAtTime(tradeTimeSeconds);

            // WORKAROUND: Backend calculation is broken at graduation, giving post-graduation values
            // If backend market cap is suspiciously high (>200K, which is above max bonding curve),
            // fall back to calculating from price × supply (DEX method)
            const MAX_BONDING_MCAP = 200000; // Bonding curve max is ~103K, use 200K as safety threshold

            if (backendMarketCap && backendMarketCap > MAX_BONDING_MCAP) {
              // Backend gave wrong value, calculate manually
              marketCapUSD = trade.priceUSD * totalSupply;
            } else {
              marketCapUSD = backendMarketCap;
            }
          } else if (trade.source === 'dex') {
            // Calculate market cap for DEX trades: price × total supply
            marketCapUSD = trade.priceUSD * totalSupply;
          }

          // Matching test-working-chart.html lines 148-165 exactly
          // If showing market cap and we have market cap data from backend, use it
          if (marketCapUSD !== null) {
            displayValue = marketCapUSD;

            // Convert to BNB if needed
            if (currency === 'bnb') {
              displayValue = marketCapUSD / bnbPrice;
            }
          } else {
            // Otherwise use price
            displayValue = trade.priceUSD;

            // Apply currency conversion (if NOT USD, convert to BNB)
            if (currency === 'bnb') {
              displayValue = trade.priceUSD / bnbPrice;
            }
          }
        } else {
          // Price mode - return raw price
          // Otherwise use price
          displayValue = trade.priceUSD;

          // Apply currency conversion (if NOT USD, convert to BNB)
          if (currency === 'bnb') {
            displayValue = trade.priceUSD / bnbPrice;
          }
        }

        // Validate displayValue
        if (!displayValue || isNaN(displayValue) || displayValue <= 0) {
          return;
        }

        if (!barMap.has(barTimeMs)) {
          // Open is the previous candle's close (or initial price for first candle)
          const open = previousClose !== null ? previousClose : displayValue;

          barMap.set(barTimeMs, {
            time: barTimeMs, // TradingView expects milliseconds
            open: open,
            high: displayValue,
            low: displayValue,
            close: displayValue,
            volume: 0,
            tradeCount: 0,
            prices: [displayValue] // Store all prices in this bar
          });
        } else {
          // Add price to existing bar
          const bar = barMap.get(barTimeMs);
          bar.prices.push(displayValue);
        }

        const bar = barMap.get(barTimeMs);
        bar.high = Math.max(bar.high, displayValue);
        bar.low = Math.min(bar.low, displayValue);
        bar.close = displayValue;
        bar.volume += trade.tokenAmount;
        bar.tradeCount++;

        // Update previous close for next bar
        previousClose = displayValue;
      });

      // Now update high/low to include the open price for each bar
      const bars = Array.from(barMap.values())
        .map(bar => {
          // High and low should span from open to all prices
          const allPrices = [bar.open, ...bar.prices];
          return {
            time: bar.time,
            open: parseFloat(bar.open.toFixed(10)),
            high: parseFloat(Math.max(...allPrices).toFixed(10)),
            low: parseFloat(Math.min(...allPrices).toFixed(10)),
            close: parseFloat(bar.close.toFixed(10)),
            volume: parseFloat(bar.volume.toFixed(8)),
            tradeCount: bar.tradeCount
          };
        })
        .sort((a, b) => a.time - b.time)
        .filter(bar => {
          // Filter out any bars with invalid values
          const isValid = bar.time > 0 &&
                         !isNaN(bar.time) &&
                         bar.open > 0 && !isNaN(bar.open) &&
                         bar.high > 0 && !isNaN(bar.high) &&
                         bar.low > 0 && !isNaN(bar.low) &&
                         bar.close > 0 && !isNaN(bar.close);

          if (!isValid) {
          }

          return isValid;
        });

      // Count how many bars have multiple trades
      const barsWithMultipleTrades = bars.filter(b => b.tradeCount > 1).length;
      if (window.lastDexDebugLogged && displayMode === 'mcap') {
      }

      // Cache the bars for this resolution/mode/currency combo
      cachedBars.set(cacheKey, bars);
      lastFetchTime = now;
      return bars;

    } catch (error) {
      return [];
    }
  };

  return {
    // Method to clear cache (called when displayMode/currency changes)
    clearCache: () => {
      cachedBars.clear();
      cachedTrades = null;
      lastFetchTime = 0;
    },

    onReady: (callback) => {
      setTimeout(() => callback({
        supported_resolutions: ['1S', '5S', '15S', '30S', '1', '3', '5', '15', '30', '60', '120', '240', 'D', '1D', 'W', '1W', 'M', '1M'],
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
        has_seconds: true,
        seconds_multipliers: ['1', '5', '15', '30'],
      }), 0);
    },

    searchSymbols: (userInput, exchange, symbolType, onResultReadyCallback) => {
      onResultReadyCallback([]);
    },

    resolveSymbol: (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
      try {
        // Read current values from refs
        const displayMode = displayModeRef.current;
        const currency = currencyRef.current;

        const baseSymbol = tokenData?.symbol || tokenData?.ticker || 'TOKEN';
        const modeLabel = displayMode === 'mcap' ? 'Market Cap' : 'Price';
        const currencyLabel = currency === 'usd' ? 'USD' : 'BNB';
        const displayName = `${baseSymbol} ${modeLabel} (${currencyLabel})`;

        const pricescale = displayMode === 'mcap' ? 1 : (currency === 'usd' ? 1000000 : 1000000000);

        const symbolInfo = {
          name: displayName,
          description: tokenData?.name || 'Token',
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          exchange: 'HAVEN',
          listed_exchange: 'HAVEN',
          ticker: baseSymbol,
          minmov: 1,
          pricescale: pricescale,
          has_intraday: true,
          has_seconds: true,
          seconds_multipliers: ['1', '5', '15', '30'],
          has_daily: true,
          has_weekly_and_monthly: true,
          supported_resolutions: ['1S', '5S', '15S', '30S', '1', '3', '5', '15', '30', '60', '120', '240', 'D', '1D', 'W', '1W', 'M', '1M'],
          volume_precision: 2,
          data_status: 'streaming',
        };

        setTimeout(() => onSymbolResolvedCallback(symbolInfo), 0);
      } catch (error) {
        setTimeout(() => onResolveErrorCallback('Failed to resolve symbol'), 0);
      }
    },

    getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
      try {
        const bars = await fetchTradesAndConvert(resolution);

        if (!bars || bars.length === 0) {
          onHistoryCallback([], { noData: true });
          return;
        }

        // TradingView passes from/to in seconds, but bars.time is now in milliseconds
        const oldestBarTime = bars[0].time;
        const newestBarTime = bars[bars.length - 1].time;


        // Convert request time from seconds to milliseconds for comparison
        const fromMs = periodParams.from * 1000;
        const toMs = periodParams.to * 1000;

        // If request is before our data starts, return empty with noData flag
        if (toMs < oldestBarTime) {
          onHistoryCallback([], { noData: true });
          return;
        }

        const filteredBars = bars.filter(bar => {
          return bar.time >= fromMs && bar.time <= toMs;
        });

        if (filteredBars.length > 0) {
        }

        onHistoryCallback(filteredBars, { noData: false });
      } catch (error) {
        onErrorCallback('Failed to load data');
      }
    },

    subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscriberUID) => {

      // Store the callback for this subscriber with last bar time tracking
      realtimeSubscribers.set(subscriberUID, {
        resolution,
        callback: onRealtimeCallback,
        lastBarTime: Date.now() // Track when we last sent data
      });

      // Also set up a fallback polling interval (will be overridden by real-time updates)
      const updateInterval = setInterval(async () => {
        try {
          const bars = await fetchTradesAndConvert(resolution);
          if (bars.length > 0) {
            const latestBar = bars[bars.length - 1];
            onRealtimeCallback(latestBar);
            // Update last bar time
            const subscriber = realtimeSubscribers.get(subscriberUID);
            if (subscriber) {
              subscriber.lastBarTime = latestBar.time;
            }
          }
        } catch (error) {
          // Silent
        }
      }, 30000); // Poll every 30 seconds as fallback

      window[`cleanup_${subscriberUID}`] = () => clearInterval(updateInterval);
    },

    unsubscribeBars: (subscriberUID) => {

      // Remove the real-time subscriber
      realtimeSubscribers.delete(subscriberUID);

      // Clean up polling interval
      const cleanup = window[`cleanup_${subscriberUID}`];
      if (cleanup) {
        cleanup();
        delete window[`cleanup_${subscriberUID}`];
      }
    },

    // New method to trigger real-time update (called from HavenTokenDetail.jsx)
    updateRealtimeBars: async () => {

      // Clear cache to force fresh data fetch
      cachedBars.clear();
      lastFetchTime = 0;

      // Notify all subscribers
      for (const [subscriberUID, subscriber] of realtimeSubscribers.entries()) {
        try {
          const bars = await fetchTradesAndConvert(subscriber.resolution);
          if (bars.length > 0) {
            // Get the last bar time we sent to this subscriber
            const lastBarTime = subscriber.lastBarTime || 0;

            // Filter bars that are newer than the last one we sent (to fill gaps)
            const newBars = bars.filter(bar => bar.time > lastBarTime);

            if (newBars.length > 0) {

              // Send all new bars to fill the gap
              for (const bar of newBars) {
                subscriber.callback(bar);
              }

              // Update the last bar time
              subscriber.lastBarTime = newBars[newBars.length - 1].time;
            } else {
              // No new bars, just send the latest one to refresh
              subscriber.callback(bars[bars.length - 1]);
              subscriber.lastBarTime = bars[bars.length - 1].time;
            }
          }
        } catch (error) {
        }
      }
    },

    getMarks: (symbolInfo, from, to, onDataCallback) => onDataCallback([]),
    getTimescaleMarks: (symbolInfo, from, to, onDataCallback) => onDataCallback([]),
    getServerTime: (callback) => callback(Math.floor(Date.now() / 1000)),
  };
}
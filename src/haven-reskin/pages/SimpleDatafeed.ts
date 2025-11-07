import {
  DatafeedConfiguration,
  ResolutionString,
  LibrarySymbolInfo,
  Bar,
  PeriodParams,
  HistoryCallback,
  ResolveCallback,
  SubscribeBarsCallback,
} from "../../../public/charting_library/charting_library";
import { usePriceStore } from "@/stores/price-store";

type DatafeedErrorCallback = (reason: string) => void;

export function SimpleDatafeed() {
  // Global subscription tracking to prevent multiple subscriptions for same symbol
  const activeSubscriptions = new Map<
    string,
    {
      interval: NodeJS.Timeout;
      cleanup: () => void;
      symbolInfo: LibrarySymbolInfo;
      resolution: string;
      isActive: boolean;
      lastUpdateTime: number;
      consecutiveFailures: number;
    }
  >();


  // Fetch historical data from klines API
  const fetchKlinesData = async (
    symbol: string,
    from: number,
    to: number,
    interval: string,
    customLimit?: number
  ): Promise<Bar[]> => {
    try {
      const params = new URLSearchParams({
        symbol: symbol,
        interval: interval,
        limit: (customLimit || 1000).toString(),
        startTime: (from * 1000).toString(),
        endTime: (to * 1000).toString(),
      });

      const response = await fetch(`/api/backend/klines?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Invalid klines data format");
      }

      // Convert Binance klines format to TradingView bars
      const bars: Bar[] = data
        .map((kline: any[]) => ({
          // eslint-disable-line @typescript-eslint/no-explicit-any
          time: kline[0], // Open time (already in milliseconds)
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5]),
        }))
        .filter(
          (bar) => bar.open > 0 && bar.high > 0 && bar.low > 0 && bar.close > 0
        )
        .sort((a, b) => a.time - b.time);

      return bars;
    } catch (error) {
      return [];
    }
  };

  // Get current price from centralized price store
  const getCurrentPrice = async (symbol: string): Promise<number | null> => {
    try {
      // Use the centralized PriceStore instead of making API calls
      const priceStoreState = usePriceStore.getState();

      // For crypto assets, use the full symbol (e.g., "SOLUSDT")
      // For non-crypto, remove USDT suffix (e.g., "NVDAUSDT" -> "NVDA")
      let lookupSymbol = symbol;
      if (symbol.includes("USDT")) {
        const baseSymbol = symbol.replace("USDT", "");
        const assetConfig = (await import('@/config/shared-assets')).getAssetBySymbol(baseSymbol);

        if (assetConfig?.assetType === 'crypto') {
          lookupSymbol = symbol; // Keep USDT for crypto (e.g., "SOLUSDT")
        } else {
          lookupSymbol = baseSymbol; // Remove USDT for non-crypto (e.g., "NVDA")
        }
      }

      const priceData = priceStoreState.getPriceData(lookupSymbol);
      if (priceData && (priceData.currentPrice || priceData.price)) {
        return priceData.currentPrice || priceData.price || null;
      }

      return null;
    } catch (error) {
      return null;
    }
  };

  const getIntervalMs = (interval: string): number => {
    const intervals: Record<string, number> = {
      "1": 60000, // 1 minute
      "5": 300000, // 5 minutes
      "15": 900000, // 15 minutes
      "30": 1800000, // 30 minutes
      "60": 3600000, // 1 hour
      "240": 14400000, // 4 hours
      D: 86400000, // 1 day
    };
    return intervals[interval] || 3600000; // Default to 1 hour
  };

  const getPolygonTimespan = (resolution: string): string => {
    switch (resolution) {
      case "1":
      case "5":
      case "15":
      case "30":
        return "minute";
      case "60":
      case "240":
        return "hour";
      case "D":
      case "1D":
        return "day";
      case "W":
      case "1W":
        return "week";
      case "M":
      case "1M":
        return "month";
      default:
        return "day";
    }
  };

  const getPolygonMultiplier = (resolution: string): number => {
    switch (resolution) {
      case "1":
        return 1;
      case "5":
        return 5;
      case "15":
        return 15;
      case "30":
        return 30;
      case "60":
        return 1;
      case "240":
        return 4;
      case "D":
      case "1D":
        return 1;
      case "W":
      case "1W":
        return 1;
      case "M":
      case "1M":
        return 1;
      default:
        return 1;
    }
  };

  return {
    onReady: (callback: (configuration: DatafeedConfiguration) => void) => {
      setTimeout(
        () =>
          callback({
            supported_resolutions: [
              "1S" as ResolutionString,
              "1" as ResolutionString,
              "3" as ResolutionString,
              "5" as ResolutionString,
              "15" as ResolutionString,
              "30" as ResolutionString,
              "60" as ResolutionString,
              "120" as ResolutionString,
              "180" as ResolutionString,
              "240" as ResolutionString,
              "480" as ResolutionString,
              "720" as ResolutionString,
              "D" as ResolutionString,
              "1D" as ResolutionString,
              "3D" as ResolutionString,
              "W" as ResolutionString,
              "1W" as ResolutionString,
              "M" as ResolutionString,
              "1M" as ResolutionString,
              "3M" as ResolutionString,
              "6M" as ResolutionString,
              "12M" as ResolutionString,
            ],
            supports_marks: false,
            supports_timescale_marks: false,
            supports_time: true,
            has_seconds: true,
            seconds_multipliers: ["1", "5", "15", "30"],
            currency_codes: ["USD", "USDT"],
          }),
        0
      );
    },

    searchSymbols: (
      userInput: string,
      _exchange: string,
      _symbolType: string,
      onResult: (symbols: any[]) => void // eslint-disable-line @typescript-eslint/no-explicit-any
    ) => {
      // Simple symbol search
      const symbols = [
        {
          symbol: userInput.toUpperCase(),
          full_name: userInput.toUpperCase(),
          description: `${userInput.toUpperCase()} / USD`,
          exchange: "CRYPTO",
          ticker: userInput.toUpperCase(),
          type: "crypto",
        },
      ];
      onResult(symbols);
    },

    resolveSymbol: async (
      symbolName: string,
      onSymbolResolvedCallback: ResolveCallback,
      onResolveErrorCallback: DatafeedErrorCallback
    ) => {
      const baseAsset = symbolName.toUpperCase().replace("USDT", "");
      const token = (await import('@/config/shared-assets')).getAssetBySymbol(baseAsset);

      if (!token) {
        onResolveErrorCallback(`Token ${baseAsset} not found in configuration`);
        return;
      }

      const assetType = token.assetType || "crypto";
      let fullSymbol: string;

      if (assetType === "crypto") {
        fullSymbol = symbolName.toUpperCase().includes("USDT")
          ? symbolName.toUpperCase()
          : `${symbolName.toUpperCase()}USDT`;
      } else if (assetType === "forex") {
        fullSymbol = baseAsset;
      } else {
        fullSymbol = baseAsset;
      }

      const symbolInfo: LibrarySymbolInfo = {
        name: fullSymbol,
        description: `${token.name} (${assetType.toUpperCase()})`,
        type: assetType,
        session: assetType === "forex" ? "24x5" : assetType === "crypto" ? "24x7" : "0930-1600",
        timezone: assetType === "forex" ? "Etc/UTC" : assetType === "crypto" ? "Etc/UTC" : "America/New_York",
        ticker: fullSymbol,
        exchange: "GhostLayer",
        listed_exchange: "GhostLayer",
        format: "price",
        minmov: 1,
        pricescale: assetType === "forex" && baseAsset.includes("JPY") ? 1000 : 100,
        has_intraday: true,
        has_seconds: true,
        seconds_multipliers: ["1", "5", "15", "30"],
        supported_resolutions: [
          "1S" as ResolutionString,
          "5S" as ResolutionString,
          "15S" as ResolutionString,
          "30S" as ResolutionString,
          "1" as ResolutionString,
          "3" as ResolutionString,
          "5" as ResolutionString,
          "15" as ResolutionString,
          "30" as ResolutionString,
          "60" as ResolutionString,
          "120" as ResolutionString,
          "240" as ResolutionString,
          "D" as ResolutionString,
          "W" as ResolutionString,
          "M" as ResolutionString,
        ],
        volume_precision: assetType === "forex" ? 0 : 8,
        data_status: "streaming",
      };

      onSymbolResolvedCallback(symbolInfo);
    },

    getBars: async (
      symbolInfo: LibrarySymbolInfo,
      resolution: string,
      periodParams: PeriodParams,
      onHistoryCallback: HistoryCallback,
      onErrorCallback: DatafeedErrorCallback
    ) => {
      const { from, to } = periodParams;

      // Get asset configuration to determine data provider
      const baseSymbol = symbolInfo.ticker?.replace('USDT', '') || '';
      const assetConfig = (await import('@/config/shared-assets')).getAssetBySymbol(baseSymbol);

      if (!assetConfig) {
        onHistoryCallback([], { noData: true });
        return;
      }

      const assetType = assetConfig.assetType || 'crypto';

      // For non-crypto assets, we need different API endpoints
      if (assetType !== 'crypto') {
        try {
          const fromDate = new Date(from * 1000);
          const toDate = new Date(to * 1000);
          const fromDateStr = fromDate.toISOString().split('T')[0];
          const toDateStr = toDate.toISOString().split('T')[0];


          const params = new URLSearchParams({
            symbol: assetConfig.providerSymbol || baseSymbol,
            timespan: getPolygonTimespan(resolution),
            multiplier: getPolygonMultiplier(resolution).toString(),
            from: fromDateStr,
            to: toDateStr,
            adjusted: 'true',
            // Add explicit limit to get more data
            limit: '5000',
          });


          const response = await fetch(`/api/backend/polygon/chart?${params.toString()}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
            },
            mode: "cors",
          });

          if (!response.ok) {
            throw new Error(`Polygon API failed: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();

          if (!data.success || !data.data?.results) {
            onHistoryCallback([], { noData: true });
            return;
          }

          const rawResults = data.data.results;

          if (rawResults.length > 0) {
          }

          const bars: Bar[] = rawResults.map((bar: any) => ({
            time: bar.t,
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v || 0,
          })).filter((bar: Bar) => {
            const isValidPrice = bar.open > 0 && bar.high > 0 && bar.low > 0 && bar.close > 0;
            const isInRange = bar.time >= from * 1000 && bar.time <= to * 1000;


            return isValidPrice && isInRange;
          }).sort((a: Bar, b: Bar) => a.time - b.time);



          onHistoryCallback(bars, { noData: bars.length === 0 });
          return;

        } catch (error) {
          onErrorCallback(`Failed to load ${assetType} data: ${error}`);
          return;
        }
      }

      try {

        // Map TradingView resolution to klines interval
        const intervalMap: Record<string, string> = {
          "1": "1m",
          "5": "5m",
          "15": "15m",
          "30": "30m",
          "60": "1h",
          "240": "4h",
          D: "1d",
        };

        const interval = intervalMap[resolution] || "1h";

        // EVERY request should hit the backend directly - no caching
        // This matches the legacy behavior where each zoom-out makes a fresh API call
        const params = new URLSearchParams({
          symbol: symbolInfo.ticker!,
          interval: interval,
          limit: "1000",
          startTime: (from * 1000).toString(),
          endTime: (to * 1000).toString(),
        });


        const response = await fetch(`http://localhost:8080/api/klines?${params.toString()}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          mode: "cors",
        });

        if (!response.ok) {
          throw new Error(`Backend failed: ${response.status} ${response.statusText}`);
        }

        const rawData = await response.json();
        const bars = Array.isArray(rawData) ? rawData.map((item: any) => ({
          time: item[0],
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5]),
        })) : [];



        // Return the bars directly from backend - no filtering, no caching

        // Only set noData when we actually have no bars to return
        onHistoryCallback(bars, { noData: bars.length === 0 });
      } catch (error) {
        onErrorCallback("Error loading historical data");
      }
    },

    subscribeBars: async (
      symbolInfo: LibrarySymbolInfo,
      resolution: string,
      onRealtimeCallback: SubscribeBarsCallback,
      subscriberUID: string,
      _onResetCacheNeededCallback?: () => void
    ) => {
      const subscriptionKey = `${symbolInfo.ticker}_${resolution}`;

      // Get asset configuration to determine subscription method
      const baseSymbol = symbolInfo.ticker?.replace('USDT', '') || '';
      const assetConfig = (await import('@/config/shared-assets')).getAssetBySymbol(baseSymbol);

      if (!assetConfig) {
        return;
      }

      const assetType = assetConfig.assetType || 'crypto';

      // Check if we already have an active subscription for this symbol+resolution
      if (activeSubscriptions.has(subscriptionKey)) {
        const existingSub = activeSubscriptions.get(subscriptionKey)!;
        existingSub.cleanup();
        activeSubscriptions.delete(subscriptionKey);
      }

      // For non-crypto assets, set up real-time updates using PriceStore
      if (assetType !== 'crypto') {
        const pollingInterval = setInterval(() => {
          try {
            // Get price data from the centralized store instead of making API calls
            const priceStoreState = usePriceStore.getState();
            const priceData = priceStoreState.getPriceData(baseSymbol);

            if (priceData && priceData.currentPrice > 0) {
              const now = Date.now();
              const barTime = Math.floor(now / getIntervalMs(resolution)) * getIntervalMs(resolution);

              // Create or update the current bar
              const currentBar = {
                time: barTime,
                open: priceData.currentPrice, // Use unified field name
                high: priceData.currentPrice,
                low: priceData.currentPrice,
                close: priceData.currentPrice,
                volume: priceData.volume24h || priceData.volume || 0,
              };

              onRealtimeCallback(currentBar);
            }
          } catch (error) {
          }
        }, assetType === 'forex' ? 5000 : 10000); // Forex updates every 5s, stocks every 10s

        activeSubscriptions.set(subscriptionKey, {
          interval: pollingInterval,
          cleanup: () => {
            clearInterval(pollingInterval);
          },
          symbolInfo,
          resolution,
          isActive: true,
          lastUpdateTime: Date.now(),
          consecutiveFailures: 0,
        });

        return;
      }

      // Get last historical bar for seamless continuation (like datafeed.ts)
      const getLastHistoricalBar = async (): Promise<Bar | null> => {
        try {
          const to = Math.floor(Date.now() / 1000);
          const intervalMs = getIntervalMs(resolution);
          const from = to - (intervalMs / 1000) * 5; // Get last 5 bars

          const intervalMap: Record<string, string> = {
            "1": "1m",
            "5": "5m",
            "15": "15m",
            "30": "30m",
            "60": "1h",
            "240": "4h",
            D: "1d",
          };
          const interval = intervalMap[resolution] || "1h";

          const bars = await fetchKlinesData(
            symbolInfo.ticker!,
            from,
            to,
            interval,
            100 // Limited for subscription initialization
          );

          if (bars && bars.length > 0) {
            const lastBar = bars[bars.length - 1];
            return lastBar;
          }

          return null;
        } catch (error) {
          return null;
        }
      };

      // Initialize subscription state
      const intervalMs = getIntervalMs(resolution);
      let currentBarTime: number | null = null;
      let currentBar: Bar | null = null;
      let updateCount = 0;
      let isActive = true;
      let isInitialized = false;

      // Initialize with historical bar for seamless continuation
      const initializeWithHistoricalBar = async () => {
        const lastHistoricalBar = await getLastHistoricalBar();
        if (lastHistoricalBar) {
          const now = Date.now();
          const barTime = Math.floor(now / intervalMs) * intervalMs;
          const lastBarTime = lastHistoricalBar.time;

          // Check if we should continue the existing bar or start a new one
          const lastBarStartTime =
            Math.floor(lastBarTime / intervalMs) * intervalMs;
          const shouldContinue = lastBarStartTime === barTime;

          if (shouldContinue) {
            currentBar = { ...lastHistoricalBar };
            currentBarTime = lastBarTime;
          } else {
            currentBar = {
              time: barTime,
              open: lastHistoricalBar.close,
              high: lastHistoricalBar.close,
              low: lastHistoricalBar.close,
              close: lastHistoricalBar.close,
              volume: 0,
            };
            currentBarTime = barTime;
          }
          isInitialized = true;
        }
      };

      // Handle price updates (similar to datafeed.ts handlePriceUpdate)
      const handlePriceUpdate = async (price: number) => {
        if (!isActive) return;

        // Initialize if needed
        if (!isInitialized) {
          await initializeWithHistoricalBar();
          if (!isInitialized) {
            // Create fresh bar if no historical data
            const now = Date.now();
            const barTime = Math.floor(now / intervalMs) * intervalMs;
            currentBar = {
              time: barTime,
              open: price,
              high: price,
              low: price,
              close: price,
              volume: 0,
            };
            currentBarTime = barTime;
            isInitialized = true;
          }
        }

        if (!currentBar) return;

        const now = Date.now();
        const barTime = Math.floor(now / intervalMs) * intervalMs;

        // Check if we need a new bar
        if (barTime !== currentBarTime) {
          // New bar - use previous close as open for seamless continuation
          const previousClose = currentBar.close;
          currentBar = {
            time: barTime,
            open: previousClose,
            high: Math.max(previousClose, price),
            low: Math.min(previousClose, price),
            close: price,
            volume: 0,
          };
          currentBarTime = barTime;
        } else {
          // Update existing bar
          currentBar = {
            ...currentBar,
            high: Math.max(currentBar.high, price),
            low: Math.min(currentBar.low, price),
            close: price,
            volume: currentBar.volume, // Keep existing volume
          };
        }

        updateCount++;

        try {
          onRealtimeCallback(currentBar);
        } catch (error) {
        }
      };

      const updateBar = async () => {
        if (!isActive) return;

        try {
          const currentPrice = await getCurrentPrice(symbolInfo.ticker!);

          if (!currentPrice || currentPrice <= 0) {
            return;
          }

          await handlePriceUpdate(currentPrice);
        } catch (error) {
        }
      };

      // Initialize immediately
      initializeWithHistoricalBar().then(() => {
      });

      // Set up regular updates - simple polling like datafeed.ts
      const updateInterval = 5000; // ✅ Increased to 5 seconds to prevent rebuild cascades

      const interval = setInterval(updateBar, updateInterval);

      // Simple cleanup function (following datafeed.ts pattern)
      const cleanup = () => {
        isActive = false;
        if (interval) {
          clearInterval(interval);
        }
      };

      // Store in active subscriptions map
      activeSubscriptions.set(subscriptionKey, {
        interval,
        cleanup,
        symbolInfo,
        resolution,
        isActive: true,
        lastUpdateTime: Date.now(),
        consecutiveFailures: 0,
      });

      // Store legacy reference for unsubscribeBars
      (window as any)[`cleanup_${subscriberUID}`] = cleanup; // eslint-disable-line @typescript-eslint/no-explicit-any

    },

    unsubscribeBars: (subscriberUID: string) => {

      const cleanup = (window as any)[`cleanup_${subscriberUID}`]; // eslint-disable-line @typescript-eslint/no-explicit-any

      if (cleanup) {
        cleanup();
      } else {
      }

      // Clean up reference
      delete (window as any)[`cleanup_${subscriberUID}`]; // eslint-disable-line @typescript-eslint/no-explicit-any

    },

    calculateHistoryDepth: (
      _resolution: string,
      _resolutionBack: string,
      _intervalBack: number
    ) => {
      return undefined;
    },

    getMarks: (
      _symbolInfo: LibrarySymbolInfo,
      _from: number,
      _to: number,
      onDataCallback: (marks: any[]) => void,
      _resolution: string
    ) => {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      onDataCallback([]);
    },

    getTimescaleMarks: (
      _symbolInfo: LibrarySymbolInfo,
      _from: number,
      _to: number,
      onDataCallback: (marks: any[]) => void,
      _resolution: string
    ) => {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      onDataCallback([]);
    },

    getServerTime: (callback: (unixTime: number) => void) => {
      callback(Math.floor(Date.now() / 1000));
    },
  };
}
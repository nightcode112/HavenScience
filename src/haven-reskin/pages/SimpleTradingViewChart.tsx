import React, { useEffect, useRef, useCallback, useState } from "react";
import { SimpleDatafeed } from "./SimpleDatafeed";

interface SimpleTradingViewChartProps {
  symbol: string;
  className?: string;
  height?: string | number;
}

declare global {
  interface Window {
    TradingView: {
      widget: new (options: TradingViewWidgetOptions) => TradingViewWidget;
    };
  }
}

interface TradingViewWidgetOptions {
  symbol: string;
  interval: string;
  container: HTMLElement;
  library_path: string;
  locale: string;
  disabled_features?: string[];
  enabled_features?: string[];
  time_frames?: Array<{
    text: string;
    resolution: string;
    description: string;
  }>;
  fullscreen: boolean;
  autosize: boolean;
  theme: string;
  timezone: string;
  datafeed: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface TradingViewWidget {
  remove(): void;
  onChartReady(callback: () => void): void;
  chart(): {
    setSymbol: (symbol: string, interval?: string, callback?: () => void) => void;
    resolution: () => string;
  };
}

// Hibernation detection hook (simplified version from original chart.tsx)
const useHibernationDetection = (forceReconnectAllSystems: () => void, isReady: boolean) => {
  const lastActiveTimeRef = useRef<number>(Date.now());
  const reconnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // IMMEDIATE reconnection function with visibility awareness
  const immediateReconnect = useCallback(
    (reason: string) => {

      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
      }

      // If tab is hidden, delay reconnection until it becomes visible
      if (document.hidden) {

        const visibilityHandler = () => {
          if (!document.hidden) {
            document.removeEventListener("visibilitychange", visibilityHandler);
            if (isReady) {
              forceReconnectAllSystems();
            }
          }
        };

        document.addEventListener("visibilitychange", visibilityHandler);
      } else {
        // Tab is visible, reconnect immediately
        reconnectionTimeoutRef.current = setTimeout(() => {
          if (isReady) {
            forceReconnectAllSystems();
          }
        }, 50); // Ultra-fast 50ms response
      }
    },
    [forceReconnectAllSystems, isReady]
  );

  // Visibility API with immediate response
  const handleVisibilityChange = useCallback(() => {
    const now = Date.now();
    const wasHidden = document.hidden;

    if (!wasHidden) {
      const timeSinceLastActive = now - lastActiveTimeRef.current;

      // Always reconnect when tab becomes visible after 2+ seconds
      if (timeSinceLastActive > 2000) {
        immediateReconnect(`Tab became visible after ${Math.floor(timeSinceLastActive / 1000)}s`);
      }
    }

    if (!document.hidden) {
      lastActiveTimeRef.current = now;
    }
  }, [immediateReconnect]);

  // Focus/blur events
  const handleFocus = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActive = now - lastActiveTimeRef.current;

    if (timeSinceLastActive > 2000) {
      immediateReconnect(`Focus after ${Math.floor(timeSinceLastActive / 1000)}s`);
    }

    lastActiveTimeRef.current = now;
  }, [immediateReconnect]);

  useEffect(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);

      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
      }
    };
  }, [handleVisibilityChange, handleFocus]);
};

const SimpleTradingViewChart: React.FC<SimpleTradingViewChartProps> = ({
  symbol,
  className = "w-full h-full",
  height = 500,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TradingViewWidget | null>(null);
  const dataFeedRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [isReady, setIsReady] = useState<boolean>(false);

  // Force reconnection system (from original chart.tsx)
  const forceReconnectAllSystems = useCallback(async () => {

    try {
      // 1. Force repair datafeed subscriptions
      if (typeof window !== "undefined" && (window as any).forceRepairSubscriptions) {
        const repairedCount = (window as any).forceRepairSubscriptions();
      }

      // 2. Refresh chart symbol connection immediately
      if (widgetRef.current && isReady) {
        try {
          const chart = widgetRef.current.chart();
          if (chart && typeof chart.setSymbol === "function") {
            const formattedSymbol = symbol.toUpperCase().includes('USDT')
              ? symbol.toUpperCase()
              : `${symbol.toUpperCase()}USDT`;
            chart.setSymbol(formattedSymbol);
          }
        } catch (error) {
        }
      }
    } catch (error) {
    }
  }, [isReady, symbol]);

  // Initialize hibernation detection
  useHibernationDetection(forceReconnectAllSystems, isReady);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize datafeed if not already created
    if (!dataFeedRef.current) {
      dataFeedRef.current = SimpleDatafeed();
    }

    // Clean up previous widget
    if (widgetRef.current) {
      try {
        widgetRef.current.remove();
      } catch (error) {
      }
      widgetRef.current = null;
    }

    const initWidget = () => {
      if (!window.TradingView || !containerRef.current) return;

      try {
        // Format symbol for crypto assets
        const formattedSymbol = symbol.toUpperCase().includes('USDT')
          ? symbol.toUpperCase()
          : `${symbol.toUpperCase()}USDT`;

        const widget = new window.TradingView.widget({
          symbol: formattedSymbol,
          datafeed: dataFeedRef.current,
          interval: "4h",
          container: containerRef.current,
          library_path: "/charting_library/",
          locale: "en",
          disabled_features: [
            "use_localstorage_for_settings",
            "volume_force_overlay",
            "header_symbol_search",
            "header_saveload",
            "go_to_date",
          ],
          enabled_features: [
            "study_templates",
            "create_volume_indicator_by_default",
            "hide_left_toolbar_by_default",
            "seconds_resolution",
          ],
          // Enable all timeframes including seconds
          time_frames: [
            { text: "1y", resolution: "1D", description: "1 Year" },
            { text: "6m", resolution: "4h", description: "6 Months" },
            { text: "3m", resolution: "1h", description: "3 Months" },
            { text: "1m", resolution: "30", description: "1 Month" },
            { text: "5d", resolution: "5", description: "5 Days" },
            { text: "1d", resolution: "1", description: "1 Day" },
            { text: "6h", resolution: "1", description: "6 Hours" },
            { text: "1h", resolution: "1", description: "1 Hour" },
            { text: "30m", resolution: "1", description: "30 Minutes" },
            { text: "15m", resolution: "1", description: "15 Minutes" },
            { text: "5m", resolution: "1", description: "5 Minutes" },
            { text: "1m", resolution: "1", description: "1 Minute" },
            { text: "30s", resolution: "1S", description: "30 Seconds" },
            { text: "15s", resolution: "1S", description: "15 Seconds" },
            { text: "5s", resolution: "1S", description: "5 Seconds" },
            { text: "1s", resolution: "1S", description: "1 Second" },
          ],
          fullscreen: false,
          autosize: true,
          theme: "light",
          timezone: "Etc/UTC",
          custom_css_url: "/tradingview-custom.css",
        });

        widget.onChartReady(() => {
          setIsReady(true);
        });

        widgetRef.current = widget;
      } catch (error) {
      }
    };

    // Load TradingView library if not already loaded
    if (!window.TradingView) {
      const script = document.createElement("script");
      script.src = "/charting_library/charting_library.standalone.js";
      script.async = true;
      script.onload = initWidget;
      script.onerror = () => {
      };
      document.head.appendChild(script);
    } else {
      initWidget();
    }

    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (error) {
        }
        widgetRef.current = null;
      }
    };
  }, [symbol]);

  return (
    <div
      className={className}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#1a1a1a",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      />
    </div>
  );
};

export default SimpleTradingViewChart;
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { createHavenTokenDatafeed } from './HavenTokenDatafeed';

const HAVEN_COLORS = {
  primary: '#5854f4',
  primaryHover: '#4c46e8',
  primaryLight: '#7c7cf6',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  background: '#0f1419',
  surface: '#1a1f2e',
  elevated: '#252d3f',
  border: '#374151',
  textPrimary: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  error: '#ef4444',
};

const HavenTokenChart = forwardRef(({ address, tokenData, supabase, className = '', displayMode = 'price', currency = 'usd', bnbPrice = 600 }, ref) => {
  const chartContainerRef = useRef(null);
  const widgetRef = useRef(null);
  const datafeedRef = useRef(null);
  const resetCacheCallbackRef = useRef(null);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const hasInitializedRef = useRef(false);
  const currentAddressRef = useRef(null);

  // Refs that the datafeed will read from (mutable, reactive)
  const displayModeRef = useRef(displayMode);
  const currencyRef = useRef(currency);
  const bnbPriceRef = useRef(bnbPrice);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    updateRealtimeBars: () => {
      if (datafeedRef.current && datafeedRef.current.updateRealtimeBars) {
        console.log('📡 [HavenTokenChart] Triggering real-time update on datafeed');
        datafeedRef.current.updateRealtimeBars();
      }
    }
  }), []);

  // Track previous values to detect changes
  const prevDisplayModeRef = useRef(displayMode);
  const prevCurrencyRef = useRef(currency);

  // Effect to update refs when props change
  useEffect(() => {
    displayModeRef.current = displayMode;
    currencyRef.current = currency;
    bnbPriceRef.current = bnbPrice;
  }, [displayMode, currency, bnbPrice]);

  // Effect for handling displayMode/currency changes (DESTROYS and recreates widget)
  useEffect(() => {
    // Skip if not initialized yet or if address changed (address change is handled separately)
    if (!hasInitializedRef.current || !widgetRef.current || address !== currentAddressRef.current) {
      prevDisplayModeRef.current = displayMode;
      prevCurrencyRef.current = currency;
      return;
    }

    // Check if displayMode or currency actually changed
    const modeChanged = displayMode !== prevDisplayModeRef.current;
    const currencyChanged = currency !== prevCurrencyRef.current;

    if (modeChanged || currencyChanged) {
      console.log('🔄 [Chart] Mode/currency changed, DESTROYING and recreating widget to force refresh');

      // Update previous refs
      prevDisplayModeRef.current = displayMode;
      prevCurrencyRef.current = currency;

      // Destroy the current widget
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (error) {
          console.error('Error removing chart:', error);
        }
        widgetRef.current = null;
      }

      // Clear datafeed cache
      if (datafeedRef.current && datafeedRef.current.clearCache) {
        console.log('🗑️ [Chart] Clearing datafeed cache');
        datafeedRef.current.clearCache();
      }

      // Reset initialization flag to trigger recreate
      hasInitializedRef.current = false;
      setIsChartLoading(true);
    }
  }, [displayMode, currency, address, tokenData]);

  // Effect for handling address changes (DOES destroy widget)
  useEffect(() => {
    // If address changed, destroy widget and reset
    if (currentAddressRef.current !== null && currentAddressRef.current !== address) {
      console.log('🔄 [Chart] Address changed, destroying widget');
      hasInitializedRef.current = false;
      setHasError(false);
      setIsChartLoading(true);

      // Clean up previous chart
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (error) {
          console.error('Error removing chart:', error);
        }
        widgetRef.current = null;
      }

      datafeedRef.current = null;
      resetCacheCallbackRef.current = null;
    }

    currentAddressRef.current = address;
  }, [address]);

  // Effect for initializing the chart
  useEffect(() => {
    // Don't initialize if no address or already initialized
    if (!address || hasInitializedRef.current) {
      return;
    }

    // Don't initialize if container isn't ready
    if (!chartContainerRef.current) {
      return;
    }

    const initChart = async () => {
      try {
        // Wait for TradingView library to load
        if (!window.TradingView) {
          const script = document.createElement('script');
          script.src = '/charting_library/charting_library.standalone.js';
          script.async = true;
          script.onload = () => {
            initChart();
          };
          script.onerror = () => {
            console.error('❌ [Chart] Failed to load TradingView library');
            setHasError(true);
            setIsChartLoading(false);
          };
          document.head.appendChild(script);
          return;
        }

        // Create datafeed with refs (so it can read current values dynamically)
        datafeedRef.current = createHavenTokenDatafeed(supabase, address, tokenData, displayModeRef, currencyRef, bnbPriceRef);

        const baseSymbol = tokenData?.symbol || tokenData?.ticker || 'TOKEN';
        const modeLabel = displayMode === 'mcap' ? 'Market Cap' : 'Price';
        const currencyLabel = currency === 'usd' ? 'USD' : 'BNB';
        const symbolName = `${baseSymbol} ${modeLabel} (${currencyLabel})`;

        // Create widget
        const widget = new window.TradingView.widget({
          symbol: symbolName,
          datafeed: datafeedRef.current,
          interval: '1',
          container: chartContainerRef.current,
          library_path: '/charting_library/',
          locale: 'en',
          disabled_features: [
            'use_localstorage_for_settings',
            'header_symbol_search',
            'header_saveload',
            'header_compare',
            'header_screenshot',
            'header_fullscreen_button',
            'display_market_status',
            'go_to_date',
            'study_templates',
          ],
          enabled_features: [
            'hide_left_toolbar_by_default',
            'create_volume_indicator_by_default',
            'seconds_resolution',
          ],
          // Enable all timeframes including seconds
          time_frames: [
            { text: "1y", resolution: "1D", description: "1 Year" },
            { text: "6m", resolution: "240", description: "6 Months" },
            { text: "3m", resolution: "60", description: "3 Months" },
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
          charts_storage_url: undefined,
          charts_storage_api_version: undefined,
          fullscreen: false,
          autosize: true,
          theme: 'dark',
          timezone: 'Etc/UTC',
          toolbar_bg: HAVEN_COLORS.surface,
          overrides: {
            'paneProperties.background': '#1a1f2e',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': HAVEN_COLORS.border,
            'paneProperties.horzGridProperties.color': HAVEN_COLORS.border,
            'paneProperties.backgroundGradientStartColor': '#1a1f2e',
            'paneProperties.backgroundGradientEndColor': '#1a1f2e',
            'symbolWatermarkProperties.transparency': 90,
            'symbolWatermarkProperties.color': HAVEN_COLORS.textMuted,
            'scalesProperties.backgroundColor': '#1a1f2e',
            'scalesProperties.textColor': HAVEN_COLORS.textPrimary,
            'scalesProperties.lineColor': HAVEN_COLORS.border,
            'mainSeriesProperties.candleStyle.upColor': '#10b981',
            'mainSeriesProperties.candleStyle.downColor': '#ef4444',
            'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
            'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
            'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
            'volumePaneSize': 'medium',
          },
          studies_overrides: {
            'volume.volume.color.0': '#ef4444',
            'volume.volume.color.1': '#10b981',
            'volume.volume.transparency': 65,
            'volume.volume ma.color': '#2962FF',
            'volume.volume ma.transparency': 30,
            'volume.volume ma.linewidth': 2,
            'volume.show ma': true,
          },
          custom_css_url: '/tradingview-custom.css',
        });

        widget.onChartReady(() => {
          hasInitializedRef.current = true;
          setIsChartLoading(false);
          setHasError(false);

          // Set visible range based on actual data
          const chart = widget.activeChart();

          setTimeout(() => {
            try {
              const timeScale = chart.getTimeScale();
              if (timeScale) {
                // Auto-scale to fit content by resetting time scale
                timeScale.resetTimeScale();
              }
            } catch (e) {
              // Silently handle chart API errors
            }
          }, 500);
        });

        widgetRef.current = widget;

        // Safety timeout
        const timeout = setTimeout(() => {
          if (isChartLoading) {
            setIsChartLoading(false);
          }
        }, 10000);

        return () => clearTimeout(timeout);

      } catch (error) {
        console.error('❌ [Chart] Error initializing chart:', error);
        setHasError(true);
        setIsChartLoading(false);
      }
    };

    initChart();

    // Cleanup
    return () => {
      if (widgetRef.current && !currentAddressRef.current) {
        try {
          widgetRef.current.remove();
        } catch (error) {
          console.error('Error removing chart:', error);
        }
        widgetRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, displayMode, currency]);

  return (
    <div className={`relative ${className}`} style={{ minHeight: '400px' }}>
      {isChartLoading && !hasError && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{ backgroundColor: '#1a1f2e' }}
        >
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p style={{ color: HAVEN_COLORS.textSecondary }}>Loading chart...</p>
          </div>
        </div>
      )}

      {hasError && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{ backgroundColor: '#1a1f2e' }}
        >
          <div className="text-center">
            <p style={{ color: HAVEN_COLORS.error }} className="mb-4">
              Failed to load chart
            </p>
            <button
              onClick={() => {
                setHasError(false);
                setIsChartLoading(true);
                hasInitializedRef.current = false;
              }}
              className="px-4 py-2 rounded"
              style={{ backgroundColor: HAVEN_COLORS.primary, color: 'white' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div
        ref={chartContainerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '400px',
          backgroundColor: '#1a1f2e',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      />
    </div>
  );
});

HavenTokenChart.displayName = 'HavenTokenChart';

export default HavenTokenChart;

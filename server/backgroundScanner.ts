/**
 * 24/7 Background Market Scanner Daemon
 * Autonomous Server-side worker that scans OKX candlestick data,
 * evaluates Gann + Wyckoff + Sq9 (5 SOP Gates V41.00), logs signals to Turso Cloud,
 * and sends instant alerts to Telegram 24/7 without needing an open browser.
 */

import { analyzeMarketData, POPULAR_SYMBOLS } from '../src/utils/technicalAnalysis';
import { sendTelegramSignalDirect } from '../api/telegram';
import { recordSignalDirect } from '../api/turso';
import { TradingMode } from '../src/types';
import { setServerStrategySettings } from '../src/utils/settingsStore';

export interface ScannerDaemonStatus {
  isActive: boolean;
  isScanning: boolean;
  intervalSeconds: number;
  tradingMode: TradingMode;
  minSopScore: number;
  totalScans: number;
  signalsDispatched: number;
  lastScanTime: string | null;
  lastScanDurationMs: number;
  symbolsCount: number;
  symbols: string[];
  lastSignals: Array<{
    symbol: string;
    decision: 'BUY' | 'SELL';
    price: number;
    sopScore: number;
    timestamp: string;
    reason: string;
    trade_setup?: any;
    telegramSent: boolean;
  }>;
  lastError: string | null;
}

class BackgroundScannerDaemon {
  private isActive: boolean = true;
  private isScanning: boolean = false;
  private intervalSeconds: number = 60; // scan every 60 seconds
  private tradingMode: TradingMode = 'INTRADAY';
  private minSopScore: number = 4; // 4/5 and 5/5 SOP Gates supported (V41.00 Enterprise Protection Shield)
  private symbols: string[] = POPULAR_SYMBOLS.map((s) => s.symbol);
  private timerId: NodeJS.Timeout | null = null;
  private totalScans: number = 0;
  private signalsDispatched: number = 0;
  private lastScanTime: string | null = null;
  private lastScanDurationMs: number = 0;
  private lastSignals: Array<{
    symbol: string;
    decision: 'BUY' | 'SELL';
    price: number;
    sopScore: number;
    timestamp: string;
    reason: string;
    trade_setup?: any;
    telegramSent: boolean;
  }> = [];
  private lastError: string | null = null;

  constructor() {
    // Synchronize backend strategy settings to match daemon minSopScore (4/5 & 5/5)
    setServerStrategySettings({
      sopScoreNeeded: 4,
      flexibleMode: true,
    });

    // Ensure primary high-liquidity symbols are always in list
    if (this.symbols.length === 0) {
      this.symbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT',
        'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'BNBUSDT',
        'LINKUSDT', 'SUIUSDT', 'PEPEUSDT', 'NEARUSDT'
      ];
    }
  }

  public start() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    this.isActive = true;
    console.log(`\n=============================================================`);
    console.log(`🤖 [24/7 Scanner Daemon] Initialized & Active`);
    console.log(`⏱️ Scan Interval: ${this.intervalSeconds}s | Mode: ${this.tradingMode} | Symbols: ${this.symbols.length}`);
    console.log(`🎯 Min SOP Gate Threshold: ${this.minSopScore}/5 Gates`);
    console.log(`=============================================================\n`);

    // Run first scan after a short delay (10s) to allow server startup
    setTimeout(() => {
      if (this.isActive) {
        this.runScanCycle().catch((err) => {
          console.error(`[24/7 Scanner] Initial cycle error:`, err);
        });
      }
    }, 10000);

    // Schedule regular scan cycles
    this.timerId = setInterval(() => {
      if (this.isActive && !this.isScanning) {
        this.runScanCycle().catch((err) => {
          console.error(`[24/7 Scanner] Cycle error:`, err);
        });
      }
    }, this.intervalSeconds * 1000);
  }

  public stop() {
    this.isActive = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    console.log(`⏸️ [24/7 Scanner Daemon] Paused by user request.`);
  }

  public setIntervalSeconds(sec: number) {
    if (sec < 15) sec = 15;
    this.intervalSeconds = sec;
    if (this.isActive) {
      this.start(); // restart with new interval
    }
  }

  public setTradingMode(mode: TradingMode) {
    this.tradingMode = mode;
  }

  public setMinSopScore(score: number) {
    const validScore = score >= 5 ? 5 : 4;
    this.minSopScore = validScore;
    setServerStrategySettings({
      sopScoreNeeded: validScore,
      flexibleMode: validScore === 4,
    });
  }

  public setSymbols(newSymbols: string[]) {
    if (Array.isArray(newSymbols) && newSymbols.length > 0) {
      const unique = Array.from(
        new Set(newSymbols.map((s) => s.replace(/[-_ /]/g, '').trim().toUpperCase()))
      );
      this.symbols = unique;
    }
  }

  public async runScanCycle(): Promise<{ scanned: number; signals: number }> {
    if (this.isScanning) {
      return { scanned: 0, signals: 0 };
    }

    this.isScanning = true;
    const startTime = Date.now();
    let detectedSignals = 0;
    const symbolsToScan = Array.from(
      new Set(this.symbols.map((s) => s.replace(/[-_ /]/g, '').trim().toUpperCase()))
    );

    try {
      const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      console.log(`[24/7 Scanner ${nowStr}] 🔍 Scanning ${symbolsToScan.length} pairs across 5 SOP Gates...`);

      // Process in batches of 3 to avoid OKX public rate limits
      const batchSize = 3;
      for (let i = 0; i < symbolsToScan.length; i += batchSize) {
        if (!this.isActive) break; // abort if stopped mid-cycle

        const batch = symbolsToScan.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (symbol) => {
            try {
              const analysis = await analyzeMarketData(symbol, this.tradingMode);
              const sop = analysis.confluenceMatrix?.sopScore 
                ?? analysis.indicators.sopScore 
                ?? (analysis.confluenceMatrix ? Math.round((analysis.confluenceMatrix.totalScore / 100) * 5) : 0);

              // Check if decision is actionable and meets minimum SOP confirmation gates
              if ((analysis.decision === 'BUY' || analysis.decision === 'SELL') && sop >= this.minSopScore) {
                // فلتر المسافة السعرية (Entry Proximity Gate): تجنب الإشارات التي يكون السعر الحالي فيها قد ابتعد كثيراً عن نقطة الدخول المحددة (> 1.2%)
                const entryDistPct = Math.abs(analysis.trade_setup?.entryDistancePercent ?? 0);
                if (analysis.trade_setup?.entry_type === 'LIMIT' && entryDistPct > 1.2) {
                  console.log(
                    `   ⏸️ [Entry Proximity Gate] ${symbol}: السعر الحالي يبتعد بنسبة ${entryDistPct}% عن نقطة الدخول المعلقة (المسموح <= 1.2%). تم تأجيل الإشعار لحين ارتداد السعر بالقرب من الدعم/المقاومة.`
                  );
                  return;
                }

                detectedSignals++;
                this.signalsDispatched++;

                console.log(
                  `\n🎯 [24/7 Scanner FOUND SIGNAL] ${analysis.decision === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${symbol} @ $${analysis.indicators.price} (SOP: ${sop}/5)`
                );

                // 1. Dispatch signal directly to Telegram bot with Quad Exit Ladder & Platform Clarity
                const teleRes = await sendTelegramSignalDirect({
                  symbol,
                  decision: analysis.decision,
                  price: analysis.indicators.price,
                  entryPrice: analysis.trade_setup?.entry_price,
                  entryType: analysis.trade_setup?.entry_type,
                  entryDistancePercent: analysis.trade_setup?.entryDistancePercent,
                  stopLoss: analysis.trade_setup?.stop_loss,
                  takeProfit: analysis.trade_setup?.take_profit || analysis.trade_setup?.take_profit_4,
                  takeProfit1: analysis.trade_setup?.take_profit_1,
                  takeProfit2: analysis.trade_setup?.take_profit_2,
                  takeProfit3: analysis.trade_setup?.take_profit_3,
                  takeProfit4: analysis.trade_setup?.take_profit_4,
                  riskRewardRatio: analysis.trade_setup?.risk_reward_ratio,
                  sopScore: sop,
                  reason: analysis.reason,
                  source: 'DAEMON_SCANNER',
                  timeframe: '15M / 1H',
                  force: false, // will deduplicate if sent within last 45 min
                });

                if (teleRes.duplicate) {
                  console.log(`   ℹ️ Telegram: Skipped duplicate notification (already sent recently).`);
                } else if (teleRes.success) {
                  console.log(`   ✈️ Telegram: Signal successfully delivered to Telegram Bot!`);
                } else {
                  console.warn(`   ⚠️ Telegram dispatch warning: ${teleRes.error}`);
                }

                // 2. Persist signal to Turso Cloud DB (skip if duplicate within notification window)
                if (!teleRes.duplicate) {
                  try {
                    await recordSignalDirect({
                      symbol,
                      decision: analysis.decision,
                      price: analysis.indicators.price,
                      reason: analysis.reason,
                      trade_setup: analysis.trade_setup,
                      sop_score: sop,
                    });
                    console.log(`   ☁️ Turso: Signal logged to Turso Cloud database.`);
                  } catch (dbErr) {
                    console.warn(`   ⚠️ Turso DB logging error:`, dbErr);
                  }
                }

                // 3. Keep in local circular history (deduplicate by symbol to avoid repeated cards for the same asset)
                this.lastSignals = this.lastSignals.filter((s) => s.symbol !== symbol);
                this.lastSignals.unshift({
                  symbol,
                  decision: analysis.decision,
                  price: analysis.indicators.price,
                  sopScore: sop,
                  timestamp: new Date().toISOString(),
                  reason: analysis.reason || 'إشارة فنية متطابقة مع مصفوفة جان ووايكوف',
                  trade_setup: analysis.trade_setup,
                  telegramSent: teleRes.success && !teleRes.duplicate,
                });

                if (this.lastSignals.length > 25) {
                  this.lastSignals.pop();
                }
              }
            } catch (symErr: any) {
              // individual symbol error (e.g. temporary timeout) - don't crash whole cycle
            }
          })
        );

        // Friendly delay between batches (350ms)
        if (i + batchSize < symbolsToScan.length) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      this.totalScans++;
      this.lastScanTime = new Date().toISOString();
      this.lastScanDurationMs = Date.now() - startTime;
      this.lastError = null;

      console.log(
        `[24/7 Scanner] ✅ Cycle finished in ${(this.lastScanDurationMs / 1000).toFixed(1)}s. Total Scans: ${this.totalScans} | Signals Found: ${detectedSignals}`
      );
    } catch (err: any) {
      this.lastError = err.message || 'Unknown scanner error';
      console.error(`[24/7 Scanner] Cycle failed:`, err);
    } finally {
      this.isScanning = false;
    }

    return { scanned: symbolsToScan.length, signals: detectedSignals };
  }

  public getStatus(): ScannerDaemonStatus {
    return {
      isActive: this.isActive,
      isScanning: this.isScanning,
      intervalSeconds: this.intervalSeconds,
      tradingMode: this.tradingMode,
      minSopScore: this.minSopScore,
      totalScans: this.totalScans,
      signalsDispatched: this.signalsDispatched,
      lastScanTime: this.lastScanTime,
      lastScanDurationMs: this.lastScanDurationMs,
      symbolsCount: this.symbols.length,
      symbols: this.symbols,
      lastSignals: this.lastSignals,
      lastError: this.lastError,
    };
  }
}

// Global Singleton Instance
export const backgroundScannerDaemon = new BackgroundScannerDaemon();

import React from 'react';
import { AnalysisResult } from '../types';
import { BarChart2, Zap, Target } from 'lucide-react';

interface IndicatorVisualizerProps {
  result: AnalysisResult;
}

export const IndicatorVisualizer: React.FC<IndicatorVisualizerProps> = ({ result }) => {
  const { indicators, candles15m, decision, trade_setup } = result;

  const candles = candles15m || [];
  const minPrice = Math.min(indicators.bb_lower_15m * 0.995, indicators.price * 0.995);
  const maxPrice = Math.max(indicators.bb_upper_15m * 1.005, indicators.price * 1.005);
  const priceRange = Math.max(0.0001, maxPrice - minPrice);

  const height = 140;
  const width = 600;
  const padding = 20;

  const getY = (val: number) => height - padding - ((val - minPrice) / priceRange) * (height - 2 * padding);

  const adxVal = indicators.adx_1h ?? indicators.adx_15m ?? 0;
  const atrVal = indicators.atr_15m ?? indicators.atr_5m ?? 0;

  return (
    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-bold text-slate-200">محرك فيبوناتشي والرسم البياني البصري (Fibonacci & Major Swings)</h4>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Lower BB: ${indicators.bb_lower_15m?.toFixed(2)} | Upper BB: ${indicators.bb_upper_15m?.toFixed(2)}
        </span>
      </div>

      {/* Fibonacci Retracements & Swings Overview Card */}
      {(indicators.swingHighPrice || indicators.fib500 || trade_setup?.fibLevels) && (
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-400 font-bold block">القمة البارزة (Swing High):</span>
            <span className="font-mono font-bold text-amber-300">
              ${(indicators.swingHighPrice ?? trade_setup?.swingHigh?.price ?? 0).toFixed(indicators.price < 1 ? 4 : 2)}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-400 font-bold block">القاع البارز (Swing Low):</span>
            <span className="font-mono font-bold text-cyan-300">
              ${(indicators.swingLowPrice ?? trade_setup?.swingLow?.price ?? 0).toFixed(indicators.price < 1 ? 4 : 2)}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-400 font-bold block">المنطقة الذهبية (50% - 78.6%):</span>
            <span className="font-mono font-bold text-emerald-400">
              ${(indicators.fib500 ?? 0).toFixed(indicators.price < 1 ? 4 : 2)} - ${(indicators.fib786 ?? 0).toFixed(indicators.price < 1 ? 4 : 2)}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-400 font-bold block">امتداد 1.618 (TP2 Target):</span>
            <span className="font-mono font-bold text-teal-300">
              ${(indicators.fibExtension1618 ?? 0).toFixed(indicators.price < 1 ? 4 : 2)}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Visual Price & Bollinger Band Canvas */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 block">نطاق Bollinger Bands (15M) وموقعه الحالي:</span>
          <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800 relative">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
              {/* Upper BB Line */}
              <line
                x1={padding}
                y1={getY(indicators.bb_upper_15m)}
                x2={width - padding}
                y2={getY(indicators.bb_upper_15m)}
                stroke="#38bdf8"
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />
              <text x={width - padding} y={getY(indicators.bb_upper_15m) - 4} fill="#38bdf8" fontSize="10" textAnchor="end">
                Upper BB (${indicators.bb_upper_15m?.toFixed(2)})
              </text>

              {/* Lower BB Line */}
              <line
                x1={padding}
                y1={getY(indicators.bb_lower_15m)}
                x2={width - padding}
                y2={getY(indicators.bb_lower_15m)}
                stroke="#38bdf8"
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />
              <text x={width - padding} y={getY(indicators.bb_lower_15m) + 12} fill="#38bdf8" fontSize="10" textAnchor="end">
                Lower BB (${indicators.bb_lower_15m?.toFixed(2)})
              </text>

              {/* Shaded BB Channel */}
              <rect
                x={padding}
                y={getY(indicators.bb_upper_15m)}
                width={width - 2 * padding}
                height={Math.max(2, getY(indicators.bb_lower_15m) - getY(indicators.bb_upper_15m))}
                fill="#38bdf8"
                fillOpacity="0.08"
              />

              {/* Candle bars if available */}
              {candles.slice(-30).map((c, idx, arr) => {
                const step = (width - 2 * padding) / arr.length;
                const x = padding + idx * step + step / 2;
                const isGreen = c.close >= c.open;
                const color = isGreen ? '#10b981' : '#f43f5e';
                const yHigh = getY(c.high);
                const yLow = getY(c.low);
                const yOpen = getY(c.open);
                const yClose = getY(c.close);

                return (
                  <g key={idx}>
                    <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1" />
                    <rect
                      x={x - step * 0.35}
                      y={Math.min(yOpen, yClose)}
                      width={Math.max(2, step * 0.7)}
                      height={Math.max(2, Math.abs(yClose - yOpen))}
                      fill={color}
                      rx="1"
                    />
                  </g>
                );
              })}

              {/* Current Price Line */}
              <line
                x1={padding}
                y1={getY(indicators.price)}
                x2={width - padding}
                y2={getY(indicators.price)}
                stroke={decision === 'BUY' ? '#10b981' : decision === 'SELL' ? '#f43f5e' : '#fbbf24'}
                strokeWidth="2"
              />
              <circle
                cx={width - padding}
                cy={getY(indicators.price)}
                r="4"
                fill={decision === 'BUY' ? '#10b981' : decision === 'SELL' ? '#f43f5e' : '#fbbf24'}
              />
            </svg>
          </div>
        </div>

        {/* Visual RSI & ADX & MACD Gauge */}
        <div className="space-y-3">
          {/* ADX 1H Gauge */}
          <div className="space-y-1.5 bg-slate-900/90 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-slate-300">قوة الاتجاه ADX (1H) - Gate 0</span>
              <span className={`font-mono ${adxVal >= 22 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}`}>
                {adxVal.toFixed(1)} {adxVal >= 22 ? '(اتجاه قوي ✓)' : '(سوق جانبي ⚠️)'}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800">
              <div className="absolute left-0 top-0 bottom-0 w-[22%] bg-rose-950/40 border-r border-rose-500/40" />
              <div
                className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${adxVal >= 22 ? 'bg-cyan-400' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, (adxVal / 60) * 100)}%` }}
              />
            </div>
          </div>

          {/* RSI Gauge */}
          <div className="space-y-1.5 bg-slate-900/90 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-slate-300">مؤشر القوة النسبية RSI (5M) - Gate 3</span>
              <span className={`font-mono ${indicators.rsi_5m <= 40 ? 'text-emerald-400 font-bold' : indicators.rsi_5m >= 60 ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                {indicators.rsi_5m?.toFixed(1) || '0.0'}
              </span>
            </div>
            {/* RSI Progress Bar */}
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800">
              <div className="absolute left-0 top-0 bottom-0 w-[40%] bg-emerald-950/60 border-r border-emerald-500/40" />
              <div className="absolute right-0 top-0 bottom-0 w-[40%] bg-rose-950/60 border-l border-rose-500/40" />
              <div
                className="absolute top-0 bottom-0 w-2 bg-amber-400 rounded-full shadow-md transition-all duration-300 transform -translate-x-1/2"
                style={{ left: `${Math.min(100, Math.max(0, indicators.rsi_5m || 50))}%` }}
              />
            </div>
          </div>

          {/* MACD & ATR Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[11px] font-bold text-slate-300">زخم MACD (1H)</div>
              <div className={`font-mono text-xs font-bold ${(indicators.macd_hist_1h ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(indicators.macd_hist_1h ?? 0) > 0 ? 'صاعد 🟢' : 'هابط 🔴'} ({(indicators.macd_hist_1h ?? 0).toFixed(4)})
              </div>
            </div>

            <div className="space-y-1 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[11px] font-bold text-slate-300">معدل التذبذب ATR (15M)</div>
              <div className="font-mono text-xs font-bold text-cyan-300">
                ${atrVal.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

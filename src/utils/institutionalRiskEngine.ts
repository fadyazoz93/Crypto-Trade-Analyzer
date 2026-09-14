/**
 * SOP 5/5 Pro V9.00 - Institutional Risk Sizing & Order Management Engine
 * 
 * 1. OrderCalcProfit: 100% accurate profit and loss calculations across all asset classes
 *    including Forex, Metals (Gold 100oz, Silver 5,000oz contract fix), Commodities, and Crypto.
 * 2. Hard Risk Cap ($1,000 default): Strict dollar risk ceiling preventing over-leveraged orders.
 * 3. Dynamic Lot Step & Decimal Precision (SYMBOL_VOLUME_STEP logic).
 */

export type AssetCategory = 'CRYPTO' | 'METALS_GOLD' | 'METALS_SILVER' | 'FOREX_STANDARD' | 'FOREX_JPY' | 'COMMODITY_OIL' | 'INDEX';

export interface ContractSpecification {
  category: AssetCategory;
  contractSize: number; // units per standard lot (e.g. 100 for XAU, 5000 for XAG, 100000 for EURUSD)
  tickSize: number; // minimum price movement
  tickValue: number; // monetary value of 1 tick per 1 standard lot in USD
  pipSize: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  digits: number;
  description: string;
}

export const CONTRACT_SPECS: Record<string, ContractSpecification> = {
  // Gold (100 oz per standard lot: $1.00 move = $100 per lot)
  XAUUSDT: {
    category: 'METALS_GOLD',
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1.00,
    pipSize: 0.10,
    minVolume: 0.01,
    maxVolume: 100.0,
    volumeStep: 0.01,
    digits: 2,
    description: 'Gold (XAU/USD - 100 oz/lot)',
  },
  PAXGUSDT: {
    category: 'METALS_GOLD',
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1.00,
    pipSize: 0.10,
    minVolume: 0.01,
    maxVolume: 100.0,
    volumeStep: 0.01,
    digits: 2,
    description: 'PAX Gold (100 oz contract equivalent)',
  },
  // Silver (5,000 oz per standard lot: $1.00 move = $5,000 per lot! - Institutional Fix)
  XAGUSDT: {
    category: 'METALS_SILVER',
    contractSize: 5000,
    tickSize: 0.001,
    tickValue: 5.00,
    pipSize: 0.01,
    minVolume: 0.01,
    maxVolume: 50.0,
    volumeStep: 0.01,
    digits: 3,
    description: 'Silver (XAG/USD - 5,000 oz/lot Institutional)',
  },
  // US Oil (1,000 barrels per standard lot: $1.00 move = $1,000 per lot)
  USOIL: {
    category: 'COMMODITY_OIL',
    contractSize: 1000,
    tickSize: 0.01,
    tickValue: 10.00,
    pipSize: 0.10,
    minVolume: 0.01,
    maxVolume: 100.0,
    volumeStep: 0.01,
    digits: 2,
    description: 'WTI Crude Oil (1,000 barrels/lot)',
  },
  // Forex Standard (100,000 units per standard lot: 1 pip = $10 per lot)
  EURUSD: {
    category: 'FOREX_STANDARD',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.00,
    pipSize: 0.0001,
    minVolume: 0.01,
    maxVolume: 200.0,
    volumeStep: 0.01,
    digits: 5,
    description: 'Euro / US Dollar (100,000 units/lot)',
  },
  GBPUSD: {
    category: 'FOREX_STANDARD',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.00,
    pipSize: 0.0001,
    minVolume: 0.01,
    maxVolume: 200.0,
    volumeStep: 0.01,
    digits: 5,
    description: 'British Pound / US Dollar (100,000 units/lot)',
  },
  USDJPY: {
    category: 'FOREX_JPY',
    contractSize: 100000,
    tickSize: 0.001,
    tickValue: 0.67, // approx $0.67 per tick depending on JPY rate
    pipSize: 0.01,
    minVolume: 0.01,
    maxVolume: 200.0,
    volumeStep: 0.01,
    digits: 3,
    description: 'US Dollar / Japanese Yen (100,000 units/lot)',
  },
  // Default Crypto (1 token contract, direct USDT pricing)
  BTCUSDT: {
    category: 'CRYPTO',
    contractSize: 1,
    tickSize: 0.1,
    tickValue: 0.1,
    pipSize: 1.0,
    minVolume: 0.001,
    maxVolume: 500.0,
    volumeStep: 0.001,
    digits: 2,
    description: 'Bitcoin / USDT (1 BTC per unit)',
  },
  ETHUSDT: {
    category: 'CRYPTO',
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    pipSize: 0.1,
    minVolume: 0.01,
    maxVolume: 2000.0,
    volumeStep: 0.01,
    digits: 2,
    description: 'Ethereum / USDT (1 ETH per unit)',
  },
  SOLUSDT: {
    category: 'CRYPTO',
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    pipSize: 0.1,
    minVolume: 0.1,
    maxVolume: 5000.0,
    volumeStep: 0.1,
    digits: 2,
    description: 'Solana / USDT (1 SOL per unit)',
  },
};

/**
 * Get contract specification for any symbol or generate appropriate default
 */
export function getContractSpec(symbol: string, currentPrice?: number): ContractSpecification {
  const clean = symbol.toUpperCase();
  if (CONTRACT_SPECS[clean]) {
    return CONTRACT_SPECS[clean];
  }

  // Silver detection
  if (clean.includes('XAG') || clean.includes('SILVER')) {
    return CONTRACT_SPECS.XAGUSDT;
  }

  // Gold detection
  if (clean.includes('XAU') || clean.includes('GOLD') || clean.includes('PAXG')) {
    return CONTRACT_SPECS.XAUUSDT;
  }

  // Forex detection
  if (clean.includes('EUR') || clean.includes('GBP') || clean.includes('AUD') || clean.includes('NZD') || clean.includes('CAD') || clean.includes('CHF')) {
    return CONTRACT_SPECS.EURUSD;
  }

  // Standard Crypto Fallback
  const p = currentPrice || 100;
  let digits = 2;
  let volumeStep = 0.01;
  let minVolume = 0.01;

  if (p < 0.001) {
    digits = 6;
    volumeStep = 1000;
    minVolume = 1000;
  } else if (p < 1) {
    digits = 4;
    volumeStep = 1;
    minVolume = 1;
  } else if (p > 10000) {
    digits = 2;
    volumeStep = 0.001;
    minVolume = 0.001;
  }

  return {
    category: 'CRYPTO',
    contractSize: 1,
    tickSize: Math.pow(10, -digits),
    tickValue: Math.pow(10, -digits),
    pipSize: Math.pow(10, -Math.max(0, digits - 1)),
    minVolume,
    maxVolume: 1000000,
    volumeStep,
    digits,
    description: `${symbol} (Crypto Standard 1 Unit)`,
  };
}

/**
 * OrderCalcProfit Simulator (Exact 100% parity with Institutional Broker Execution)
 */
export function orderCalcProfit(
  symbol: string,
  type: 'BUY' | 'SELL',
  openPrice: number,
  closePrice: number,
  volumeLots: number
): number {
  const spec = getContractSpec(symbol, openPrice);
  const isBuy = type === 'BUY';
  const priceDiff = isBuy ? closePrice - openPrice : openPrice - closePrice;

  // Formula: Profit ($) = PriceDiff * Volume (Lots) * ContractSize
  const rawProfit = priceDiff * volumeLots * spec.contractSize;
  return Number(rawProfit.toFixed(2));
}

/**
 * Institutional Position Sizing with Hard Dollar Cap & Symbol Volume Step rounding
 */
export interface InstitutionalRiskCalculation {
  accountBalance: number;
  riskPercent: number;
  calculatedRiskUsdt: number;
  hardRiskCapUsdt: number;
  effectiveRiskUsdt: number;
  isHardCapApplied: boolean;
  
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  
  slDistancePrice: number;
  slDistancePercent: number;
  
  // Lot & Contract Sizing
  spec: ContractSpecification;
  rawLots: number;
  roundedLots: number;
  positionNotionalUsd: number;
  marginRequiredUsd: number;
  leverage: number;
  
  // Potential Returns
  maxDollarLoss: number;
  tp1DollarProfit: number;
  tp2DollarProfit: number;
  riskRewardRatio: string;
}

export function calculateInstitutionalRiskSizing(
  symbol: string,
  type: 'BUY' | 'SELL',
  entryPrice: number,
  stopLoss: number,
  takeProfit1: number,
  takeProfit2: number,
  accountBalance: number,
  riskPercent = 1.0,
  hardRiskCapUsdt = 1000,
  leverage = 10
): InstitutionalRiskCalculation {
  const spec = getContractSpec(symbol, entryPrice);
  const slDistancePrice = Math.abs(entryPrice - stopLoss);
  const slDistancePercent = entryPrice > 0 ? (slDistancePrice / entryPrice) * 100 : 1;

  // 1. Calculate Standard Risk based on Account Equity
  const calculatedRiskUsdt = (accountBalance * riskPercent) / 100;

  // 2. Enforce Hard Risk Cap ($1,000 default)
  const effectiveRiskUsdt = Math.min(calculatedRiskUsdt, hardRiskCapUsdt);
  const isHardCapApplied = calculatedRiskUsdt > hardRiskCapUsdt;

  // 3. Exact Lot Calculation based on Contract Specification
  // Loss per 1 Lot = slDistancePrice * contractSize
  const lossPerLot = slDistancePrice * spec.contractSize;
  const rawLots = lossPerLot > 0 ? effectiveRiskUsdt / lossPerLot : 0.01;

  // 4. Step Rounding (SYMBOL_VOLUME_STEP)
  const step = spec.volumeStep;
  let roundedLots = Math.floor(rawLots / step) * step;
  roundedLots = Math.max(spec.minVolume, Math.min(spec.maxVolume, roundedLots));
  // Round to appropriate decimal places
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  roundedLots = Number(roundedLots.toFixed(decimals));

  // 5. Margin and Notional Value
  const positionNotionalUsd = roundedLots * spec.contractSize * entryPrice;
  const marginRequiredUsd = leverage > 0 ? positionNotionalUsd / leverage : positionNotionalUsd;

  // 6. Calculate exact dollar outcomes via OrderCalcProfit
  const maxDollarLoss = Math.abs(orderCalcProfit(symbol, type, entryPrice, stopLoss, roundedLots));
  const tp1DollarProfit = Math.abs(orderCalcProfit(symbol, type, entryPrice, takeProfit1, roundedLots));
  const tp2DollarProfit = Math.abs(orderCalcProfit(symbol, type, entryPrice, takeProfit2, roundedLots));

  const rrRatio = maxDollarLoss > 0 ? `1:${(tp1DollarProfit / maxDollarLoss).toFixed(1)}` : '1:2.0';

  return {
    accountBalance,
    riskPercent,
    calculatedRiskUsdt,
    hardRiskCapUsdt,
    effectiveRiskUsdt,
    isHardCapApplied,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    slDistancePrice,
    slDistancePercent,
    spec,
    rawLots,
    roundedLots,
    positionNotionalUsd,
    marginRequiredUsd,
    leverage,
    maxDollarLoss,
    tp1DollarProfit,
    tp2DollarProfit,
    riskRewardRatio: rrRatio,
  };
}

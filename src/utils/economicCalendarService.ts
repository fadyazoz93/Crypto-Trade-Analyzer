/**
 * Institutional Economic Calendar Protection Service
 * Emulates MQL5 CalendarValueHistory high-impact news filter
 * Prevents trading 15 minutes before and after Tier-1 news (CPI, NFP, Fed Rate, FOMC, ECB)
 */

export interface EconomicNewsEvent {
  id: string;
  title: string;
  currency: string; // USD, EUR, GBP, JPY, etc.
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  timeUtc: string; // HH:mm
  date: string; // YYYY-MM-DD
  forecast?: string;
  previous?: string;
}

// Built-in recurring schedule or high-impact catalog for major FX/Metals triggers
export const SAMPLE_HIGH_IMPACT_EVENTS: EconomicNewsEvent[] = [
  { id: 'cpi-usd', title: 'US Consumer Price Index (CPI MoM/YoY)', currency: 'USD', impact: 'HIGH', timeUtc: '12:30', date: '' },
  { id: 'nfp-usd', title: 'US Non-Farm Payrolls (NFP) & Unemployment', currency: 'USD', impact: 'HIGH', timeUtc: '12:30', date: '' },
  { id: 'fomc-usd', title: 'FOMC Rate Decision & Fed Press Conference', currency: 'USD', impact: 'HIGH', timeUtc: '18:00', date: '' },
  { id: 'ecb-eur', title: 'ECB Monetary Policy Decision', currency: 'EUR', impact: 'HIGH', timeUtc: '12:15', date: '' },
  { id: 'boe-gbp', title: 'Bank of England Official Bank Rate', currency: 'GBP', impact: 'HIGH', timeUtc: '11:00', date: '' },
];

export interface NewsFilterStatus {
  isNewsLockActive: boolean;
  activeEvent?: EconomicNewsEvent;
  minutesToEvent?: number;
  message: string;
}

/**
 * Checks if current time is within +/- buffer minutes of a high-impact news event
 */
export function checkEconomicCalendarNewsLock(
  symbol: string,
  bufferMinutes = 15
): NewsFilterStatus {
  const now = new Date();
  const currentUtcHour = now.getUTCHours();
  const currentUtcMin = now.getUTCMinutes();
  const currentUtcTotalMin = currentUtcHour * 60 + currentUtcMin;

  const cleanSym = symbol.toUpperCase();
  const isForexOrMetal = !cleanSym.endsWith('USDT') || cleanSym.includes('XAU') || cleanSym.includes('XAG') || cleanSym.includes('GOLD') || cleanSym.includes('SILVER');

  // If pure crypto that isn't influenced by macro USD announcements, we can still monitor USD events if desired
  const relevantEvents = SAMPLE_HIGH_IMPACT_EVENTS.filter((e) => {
    if (e.impact !== 'HIGH') return false;
    if (e.currency === 'USD') return true; // USD affects Gold, Silver, Forex majors, and Crypto liquidity
    if (cleanSym.includes(e.currency)) return true;
    return false;
  });

  for (const event of relevantEvents) {
    const [evHour, evMin] = event.timeUtc.split(':').map(Number);
    const eventTotalMin = evHour * 60 + evMin;
    const diffMinutes = eventTotalMin - currentUtcTotalMin;

    // Inside window: from bufferMinutes before event until bufferMinutes after event
    if (diffMinutes >= -bufferMinutes && diffMinutes <= bufferMinutes) {
      const isBefore = diffMinutes >= 0;
      return {
        isNewsLockActive: true,
        activeEvent: event,
        minutesToEvent: Math.abs(diffMinutes),
        message: isBefore
          ? `⚠️ خبر اقتصادي عالي التأثير (${event.title}) خلال ${diffMinutes} دقيقة. تم حظر التداول لتجنب الانزلاقات.`
          : `⚠️ تم صدور خبر عالي التأثير (${event.title}) قبل ${Math.abs(diffMinutes)} دقيقة. جاري استقرار السيولة.`,
      };
    }
  }

  return {
    isNewsLockActive: false,
    message: 'لا توجد أخبار اقتصادية عالية التأثير في نطاق الـ 15 دقيقة.',
  };
}

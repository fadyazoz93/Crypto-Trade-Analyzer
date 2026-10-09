/**
 * Slippage & Flash Spike Protection Manager (قاطع حماية الانزلاقات السعرية ومهلة التبريد 30 دقيقة)
 * 
 * القواعد المؤسسية الصارمة:
 * 1. تجميد فوري لإرسال الإشارات (Telegram, Audio, Browser) أثناء حدوث الانزلاق السعري الحي (Live Slippage / Flash Spikes)
 * 2. بدء مهلة تبريد تلقائية لمدة 30 دقيقة (30-Minute Cooldown) فور انتهاء الشمعة الانزلاقية لامتصاص الصدمة وتطبيع مؤشر التقلب وعودة عمق دفتر الأوامر
 * 3. حظر صفقات البيع المباشرة (Market Shorts) أثناء الانزلاقات الهابطة أو في قيعان الانهيارات المفاجئة لمنع فخاخ التغطية الانفجارية (Short Squeeze)
 * 4. السماح بصفقات البيع بعد انقضاء الـ 30 دقيقة فقط في حال:
 *    - حدوث كنس صاعد (PDH / High Sweep) متبوع بـ MSS + FVG هابطين
 *    - أو ارتداد تصحيحي هادئ نحو منطقة الـ Premium (اختبار 50% FVG أو VWAP أو زاوية جان 50%)
 */

import { getStrategySettings } from './settingsStore';

export interface SlippageIncidentRecord {
  symbol: string;
  detectedAt: number;
  cooldownExpiresAt: number;
  spikeType: 'FLASH_DUMP' | 'PUMP_SPIKE' | 'EXTREME_ATR_EXPANSION' | 'ORDERBOOK_VOID';
  peakPrice: number;
  troughPrice: number;
  retracement50Price: number;
  reason: string;
  isSpikeActive: boolean;
}

export interface SlippageProtectionStatus {
  isSlippageActive: boolean;
  isCooldownActive: boolean;
  cooldownRemainingSeconds: number;
  cooldownDurationMinutes: number;
  cooldownExpiresAt?: number;
  spikeType?: 'FLASH_DUMP' | 'PUMP_SPIKE' | 'EXTREME_ATR_EXPANSION' | 'ORDERBOOK_VOID';
  signalsPaused: boolean;
  shortAllowed: boolean;
  shortRestrictionReason?: string;
  statusBadge: string;
  note: string;
}

const STORAGE_KEY = 'v9_slippage_circuit_breaker_registry';
const DEFAULT_COOLDOWN_MINUTES = 30;

class SlippageProtectionManager {
  private inMemoryIncidents: Map<string, SlippageIncidentRecord> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private getKey(symbol: string): string {
    return String(symbol || '').replace(/[-_ /]/g, '').trim().toUpperCase();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: Record<string, SlippageIncidentRecord> = JSON.parse(raw);
      const now = Date.now();
      Object.entries(parsed).forEach(([key, record]) => {
        // إذا لم تنتهِ مهلة التبريد بـ 2 ساعة، نحتفظ بها
        if (now < record.cooldownExpiresAt + 2 * 60 * 60 * 1000) {
          this.inMemoryIncidents.set(key, record);
        }
      });
    } catch (e) {
      console.warn('Could not load slippage incidents from localStorage', e);
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      const obj: Record<string, SlippageIncidentRecord> = {};
      this.inMemoryIncidents.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Could not save slippage incidents to localStorage', e);
    }
  }

  private notifyListeners() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('slippage-protection-updated'));
    }
  }

  /**
   * تسجيل حادثة انزلاق سعري أو قاطع دائرة لحظي وتفعيل مهلة التبريد (30 دقيقة افتراضياً)
   */
  public registerIncident(
    symbol: string,
    spikeType: 'FLASH_DUMP' | 'PUMP_SPIKE' | 'EXTREME_ATR_EXPANSION' | 'ORDERBOOK_VOID',
    currentPrice: number,
    peakPrice: number,
    troughPrice: number,
    reason: string,
    isCurrentlyActiveSpike: boolean = true,
    customCooldownMinutes?: number
  ): SlippageIncidentRecord {
    const key = this.getKey(symbol);
    const settings = getStrategySettings();
    const cooldownMinutes = customCooldownMinutes ?? (settings.slippageCooldownMinutes || DEFAULT_COOLDOWN_MINUTES);
    const now = Date.now();
    const cooldownExpiresAt = now + cooldownMinutes * 60 * 1000;

    const retracement50Price = troughPrice > 0 && peakPrice > troughPrice
      ? Number(((peakPrice + troughPrice) / 2).toFixed(currentPrice < 1 ? 6 : 2))
      : currentPrice;

    const existing = this.inMemoryIncidents.get(key);
    // إذا كان هناك تبريد ساري ومدة انتهاء أبعد، نحافظ على الأبعد
    const finalExpiresAt = existing && existing.cooldownExpiresAt > cooldownExpiresAt
      ? existing.cooldownExpiresAt
      : cooldownExpiresAt;

    const record: SlippageIncidentRecord = {
      symbol: key,
      detectedAt: now,
      cooldownExpiresAt: finalExpiresAt,
      spikeType,
      peakPrice: Math.max(peakPrice, existing?.peakPrice || currentPrice),
      troughPrice: Math.min(troughPrice, existing?.troughPrice || currentPrice),
      retracement50Price,
      reason,
      isSpikeActive: isCurrentlyActiveSpike,
    };

    this.inMemoryIncidents.set(key, record);
    this.saveToStorage();
    this.notifyListeners();
    return record;
  }

  /**
   * قراءة حالة درع الانزلاقات وفترة التبريد لرمز محدد
   */
  public getStatus(symbol: string, currentPrice?: number, isPdhSweep?: boolean): SlippageProtectionStatus {
    const key = this.getKey(symbol);
    const record = this.inMemoryIncidents.get(key);
    const settings = getStrategySettings();
    const cooldownDurationMinutes = settings.slippageCooldownMinutes || DEFAULT_COOLDOWN_MINUTES;

    if (!record) {
      return {
        isSlippageActive: false,
        isCooldownActive: false,
        cooldownRemainingSeconds: 0,
        cooldownDurationMinutes,
        signalsPaused: false,
        shortAllowed: true,
        statusBadge: 'NORMAL_LIQUIDITY',
        note: 'سيولة مستقرة وعمق دفتر الأوامر طبيعي. لا توجد انزلاقات مفاجئة.',
      };
    }

    const now = Date.now();
    const isCooldownActive = now < record.cooldownExpiresAt;
    const remainingSeconds = isCooldownActive ? Math.ceil((record.cooldownExpiresAt - now) / 1000) : 0;
    const isSlippageActive = record.isSpikeActive && isCooldownActive;

    // فحص شروط صفقات البيع
    let shortAllowed = true;
    let shortRestrictionReason: string | undefined = undefined;

    if (isSlippageActive) {
      shortAllowed = false;
      shortRestrictionReason = '⚠️ حظر البيع المباشر: انزلاق سعري حي نشط. يمنع التداول أثناء حركة الشمعة الشاذة لتفادي الانزلاق السلبي.';
    } else if (isCooldownActive) {
      shortAllowed = false;
      shortRestrictionReason = `⏳ حظر البيع: فترة تبريد الانزلاق نشطة (${Math.ceil(remainingSeconds / 60)} دقيقة متبقية). يلزم انتظار استقرار دفتر الأوامر واكتمال فريم 5 دقائق.`;
    } else if (record.spikeType === 'FLASH_DUMP' && settings.preventShortingFlashCrashBottom !== false) {
      // بعد انتهاء الـ 30 دقيقة: فحص هل السعر لا يزال في قاع الانهيار دون ارتداد
      if (currentPrice && record.peakPrice > record.troughPrice) {
        const dumpRange = record.peakPrice - record.troughPrice;
        const currentPullback = currentPrice - record.troughPrice;
        const pullbackPercent = (currentPullback / dumpRange) * 100;

        // إذا لم يرتد السعر على الأقل 35% إلى منطقة الـ Premium ولم يحدث سحب قمة، يمنع بيع القاع
        if (pullbackPercent < 35 && !isPdhSweep) {
          shortAllowed = false;
          shortRestrictionReason = `⚠️ حظر بيع القاع (Don't Short the Dump Low): السعر لم يرتد بما يكفي لتغطية اختلال السيولة (نسبة الارتداد ${pullbackPercent.toFixed(1)}% < 35%). يتطلب الدخول بيعاً ارتداداً نحو منطقة الـ Premium ($${record.retracement50Price}) لتفادي فخ الارتداد الانفجاري.`;
        }
      }
    }

    const signalsPaused = isSlippageActive || isCooldownActive;

    let statusBadge = 'NORMAL_LIQUIDITY';
    if (isSlippageActive) statusBadge = 'SLIPPAGE_SPIKE_ACTIVE';
    else if (isCooldownActive) statusBadge = 'COOLDOWN_ACTIVE';

    let note = '';
    if (isSlippageActive) {
      note = `⚠️ قاطع الدائرة نشط: انزلاق سعري حاد! تم تجميد إرسال كافة الإشارات فورياً لحماية الحساب.`;
    } else if (isCooldownActive) {
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      note = `⏳ تجميد الإشارات مؤقتاً: متبقي ${mins}:${secs < 10 ? '0' : ''}${secs} دقيقة من مهلة التبريد الـ 30 دقيقة لامتصاص الصدمة وتشكيل هيكل 5M مستقر.`;
    } else {
      note = 'انتهت مهلة تبريد الانزلاق وعاد دفتر الأوامر لطبيعته. استئناف الإشارات بفلترة ارتداد مناطق Premium.';
    }

    return {
      isSlippageActive,
      isCooldownActive,
      cooldownRemainingSeconds: remainingSeconds,
      cooldownDurationMinutes,
      cooldownExpiresAt: record.cooldownExpiresAt,
      spikeType: record.spikeType,
      signalsPaused,
      shortAllowed,
      shortRestrictionReason,
      statusBadge,
      note,
    };
  }

  /**
   * فحص هل إرسال الإشارات مجمد لعملة محددة
   */
  public isSignalBlocked(symbol: string): { blocked: boolean; reason?: string } {
    const settings = getStrategySettings();
    if (settings.enableSlippageCooldownGuard === false) {
      return { blocked: false };
    }

    const status = this.getStatus(symbol);
    if (status.signalsPaused) {
      return {
        blocked: true,
        reason: status.note,
      };
    }
    return { blocked: false };
  }

  /**
   * إعادة تعيين يدوي للحادثة إذا رغب المتداول
   */
  public clearIncident(symbol: string) {
    const key = this.getKey(symbol);
    this.inMemoryIncidents.delete(key);
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * مسح جميع الحوادث
   */
  public clearAll() {
    this.inMemoryIncidents.clear();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.notifyListeners();
  }
}

export const slippageProtectionManager = new SlippageProtectionManager();

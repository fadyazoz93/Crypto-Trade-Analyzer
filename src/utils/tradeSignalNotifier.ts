/**
 * Trade Signal Notification Registry & Deduplication Manager
 * يضمن إرسال إشعار صفقة أي عملة مرة واحدة فقط (One-Time Notification Per Trade Setup)
 * ويمنع التكرار نهائياً عبر ماسح السوق، الشارت، البث المباشر، وتليجرام، مع الحفظ الدائم في localStorage
 */

import { getStrategySettings } from './settingsStore';

export interface NotifiedSignalRecord {
  symbol: string;
  decision: 'BUY' | 'SELL';
  entryPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
  target50PercentPrice?: number;
  lockProfitPrice?: number;
  securityUpdateSent?: boolean;
  sentAt: number;
  channels: ('BROWSER' | 'TELEGRAM' | 'AUDIO')[];
}

const STORAGE_KEY = 'v9_notified_trade_signals_registry';
// مدة بقاء الإشعار نشطاً في الذاكرة التراكمية (12 ساعة افتراضياً)
const SIGNAL_EXPIRY_MS = 12 * 60 * 60 * 1000;

// الحد الأدنى للمهلة الزمنية الصارمة بين تنبيهين متتاليين لنفس الصفقة والعملة (60 دقيقة لمنع التكرار نهائياً)
export const DEFAULT_SIGNAL_COOLDOWN_MS = 60 * 60 * 1000; // 60 دقيقة = 3,600,000 ميلي ثانية

class TradeSignalNotificationManager {
  private inMemoryRegistry: Map<string, NotifiedSignalRecord> = new Map();
  // مهلة منع التكرار بالملي ثانية (60 دقيقة افتراضياً)
  private cooldownMs: number = DEFAULT_SIGNAL_COOLDOWN_MS;

  constructor() {
    this.loadFromStorage();
    this.syncFromSettings();

    // الاستماع لأي تعديل على الإعدادات لتحديث مهلة التكرار لحظياً
    if (typeof window !== 'undefined') {
      window.addEventListener('strategy-settings-updated', (e: any) => {
        if (e.detail?.signalCooldownMinutes) {
          this.setCooldownMinutes(Number(e.detail.signalCooldownMinutes));
        }
      });
    }
  }

  private syncFromSettings() {
    try {
      const s = getStrategySettings();
      if (s.signalCooldownMinutes && s.signalCooldownMinutes > 0) {
        this.cooldownMs = s.signalCooldownMinutes * 60 * 1000;
      }
    } catch {}
  }

  /**
   * تعديل مهلة منع التكرار (بالدقائق)
   */
  public setCooldownMinutes(minutes: number) {
    if (minutes > 0) {
      this.cooldownMs = minutes * 60 * 1000;
    }
  }

  /**
   * قراءة مهلة منع التكرار الحالية بالدقائق
   */
  public getCooldownMinutes(): number {
    return Math.round(this.cooldownMs / (60 * 1000));
  }

  private getKey(symbol: string, decision?: 'BUY' | 'SELL'): string {
    const cleanSym = String(symbol || '').replace(/[-_ /]/g, '').trim().toUpperCase();
    return decision ? `${cleanSym}_${decision}` : cleanSym;
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: Record<string, NotifiedSignalRecord> = JSON.parse(raw);
      const now = Date.now();

      Object.entries(parsed).forEach(([key, record]) => {
        // تنظيف الإشعارات القديمة جداً
        if (now - record.sentAt < SIGNAL_EXPIRY_MS) {
          this.inMemoryRegistry.set(key, record);
        }
      });
    } catch (e) {
      console.warn('Could not load trade signal registry from localStorage', e);
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      const obj: Record<string, NotifiedSignalRecord> = {};
      this.inMemoryRegistry.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Could not save trade signal registry to localStorage', e);
    }
  }

  /**
   * فحص هل الصفقة ضمن مهلة منع التكرار (30 دقيقة افتراضياً)
   * @param symbol رمز العملة (مثل BTCUSDT)
   * @param decision قرار الصفقة (BUY أو SELL)
   * @returns true إذا مر أقل من 30 دقيقة على آخر إشعار لنفس الصفقة، false إذا انقضت المهلة
   */
  public isWithinCooldown(symbol: string, decision: 'BUY' | 'SELL'): boolean {
    const key = this.getKey(symbol, decision);
    const existing = this.inMemoryRegistry.get(key);
    if (!existing) return false;
    const elapsed = Date.now() - existing.sentAt;
    return elapsed < this.cooldownMs;
  }

  /**
   * إرجاع الوقت المتبقي بالثواني لانتهاء مهلة منع التكرار لعملة محددة
   */
  public getRemainingCooldownSeconds(symbol: string, decision: 'BUY' | 'SELL'): number {
    const key = this.getKey(symbol, decision);
    const existing = this.inMemoryRegistry.get(key);
    if (!existing) return 0;
    const elapsed = Date.now() - existing.sentAt;
    if (elapsed >= this.cooldownMs) return 0;
    return Math.ceil((this.cooldownMs - elapsed) / 1000);
  }

  /**
   * فحص هل تم إرسال إشعار لهذه العملة في نفس الاتجاه مسبقاً خلال نافذة الـ 30 دقيقة
   * @param symbol رمز العملة (مثل BTCUSDT)
   * @param decision قرار الصفقة (BUY أو SELL)
   * @param channel القناة المراد الفحص لها (BROWSER أو TELEGRAM أو AUDIO)
   * @returns true إذا كان قد تم الإرسال مؤخراً ويجب حجب التكرار (أقل من 30 دقيقة)، false إذا كانت إشارة جديدة أو انقضت مهلة الـ 30 دقيقة
   */
  public hasBeenNotified(
    symbol: string,
    decision: 'BUY' | 'SELL',
    channel?: 'BROWSER' | 'TELEGRAM' | 'AUDIO'
  ): boolean {
    const key = this.getKey(symbol, decision);
    const existing = this.inMemoryRegistry.get(key);

    if (!existing) {
      return false;
    }

    const elapsed = Date.now() - existing.sentAt;

    // 1. تنظيف السجلات التي انتهت صلاحيتها كلياً (أكثر من 12 ساعة)
    if (elapsed >= SIGNAL_EXPIRY_MS) {
      this.inMemoryRegistry.delete(key);
      this.saveToStorage();
      return false;
    }

    // 2. منطق زمني حاسم: إذا انقضت مهلة الـ 30 دقيقة، يُسمح بتجديد التنبيه في حال تجددت الشروط
    if (elapsed >= this.cooldownMs) {
      return false;
    }

    // 3. ضمن نافذة الـ 30 دقيقة:
    // إذا تم تحديد قناة معينة (مثال: TELEGRAM أو BROWSER أو AUDIO)
    if (channel) {
      return existing.channels.includes(channel);
    }

    // إذا لم تُحدد قناة، يُعتبر مرسلاً إذا تم تنبيه أي قناة خلال الـ 30 دقيقة الماضية
    return true;
  }

  /**
   * تسجيل أن الإشعار تم إرساله بنجاح لمنع تكراره مستقبلاً
   */
  public markAsNotified(
    symbol: string,
    decision: 'BUY' | 'SELL',
    channel: 'BROWSER' | 'TELEGRAM' | 'AUDIO',
    entryPrice?: number,
    stopLoss?: number,
    targetPrice?: number,
    target50PercentPrice?: number,
    lockProfitPrice?: number
  ) {
    const key = this.getKey(symbol, decision);
    const existing = this.inMemoryRegistry.get(key);

    if (existing) {
      if (!existing.channels.includes(channel)) {
        existing.channels.push(channel);
      }
      existing.sentAt = Date.now();
      if (entryPrice) existing.entryPrice = entryPrice;
      if (stopLoss) existing.stopLoss = stopLoss;
      if (targetPrice) existing.targetPrice = targetPrice;
      if (target50PercentPrice) existing.target50PercentPrice = target50PercentPrice;
      if (lockProfitPrice) existing.lockProfitPrice = lockProfitPrice;
      this.inMemoryRegistry.set(key, existing);
    } else {
      this.inMemoryRegistry.set(key, {
        symbol: symbol.trim().toUpperCase(),
        decision,
        entryPrice,
        stopLoss,
        targetPrice,
        target50PercentPrice,
        lockProfitPrice,
        securityUpdateSent: false,
        sentAt: Date.now(),
        channels: [channel],
      });
    }

    this.saveToStorage();
  }

  /**
   * فحص وصول السعر اللحظي إلى 50% من مشوار الهدف لإرسال رسالة تحديث الأمان المستقلة
   */
  public checkAndTriggerSecurityUpdate(
    symbol: string,
    currentPrice: number,
    onTrigger: (record: NotifiedSignalRecord) => void
  ) {
    if (!currentPrice || currentPrice <= 0) return;
    const cleanSym = String(symbol || '').replace(/[-_ /]/g, '').trim().toUpperCase();

    ['BUY', 'SELL'].forEach((dir) => {
      const key = `${cleanSym}_${dir}`;
      const record = this.inMemoryRegistry.get(key);
      if (!record || record.securityUpdateSent) return;

      const isBuy = record.decision === 'BUY';
      const target50 = record.target50PercentPrice;
      const lockSl = record.lockProfitPrice;
      if (!target50 || !lockSl) return;

      // تحقق من وصول السعر إلى 50% من الهدف
      const reached = isBuy ? currentPrice >= target50 : currentPrice <= target50;
      if (reached) {
        record.securityUpdateSent = true;
        this.saveToStorage();
        onTrigger(record);
      }
    });
  }

  /**
   * مسح تسجيل عملة محددة عند تغير الاتجاه أو إلغاء الصفقة
   */
  public clearSignalForSymbol(symbol: string) {
    const cleanSym = String(symbol || '').replace(/[-_ /]/g, '').trim().toUpperCase();
    let removed = false;
    ['BUY', 'SELL'].forEach((dir) => {
      const key = `${cleanSym}_${dir}`;
      if (this.inMemoryRegistry.has(key)) {
        this.inMemoryRegistry.delete(key);
        removed = true;
      }
    });
    if (removed) {
      this.saveToStorage();
    }
  }

  /**
   * الحصول على إجمالي عدد العملات التي تم إرسال إشعارات لها
   */
  public getNotifiedCount(): number {
    return this.inMemoryRegistry.size;
  }

  /**
   * الحصول على سجل العملات التي تم إرسال إشعارات لها
   */
  public getNotifiedRecords(): NotifiedSignalRecord[] {
    return Array.from(this.inMemoryRegistry.values()).sort((a, b) => b.sentAt - a.sentAt);
  }

  /**
   * تصفير السجل بالكامل (لإعادة السماح بالإشعارات من جديد يدوياً إذا رغب المستخدم)
   */
  public clearAll() {
    this.inMemoryRegistry.clear();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export const signalNotificationManager = new TradeSignalNotificationManager();

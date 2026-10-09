// "Before you start" notice: shown before onboarding and again whenever NOTICE_VERSION grows.
// To announce an update, bump NOTICE_VERSION and add its bullet points to NOTICE_UPDATES.
// The accepted version lives in localStorage.
import { prefKey } from '@/lib/store'

export const NOTICE_VERSION = 1

export const NOTICE_LIMITS = [
  'داده‌ها فقط روی همین مرورگر ذخیره می‌شوند. تغییر مرورگر یا پاک کردن اطلاعات سایت، همه‌ی داده‌ها را از بین می‌برد؛ پشتیبان‌گیری منظم (تنظیمات > داده‌ها) با خودتان است.',
  'داده‌ها همگام نمی‌شوند؛ رایانه یا مرورگر دیگر چیزی از آن‌ها نمی‌بیند و استفاده‌ی هم‌زمان چند نفر هماهنگ نمی‌شود.',
  'زمان‌سنج‌ها و انتظار ۲۴ ساعته به ساعت رایانه وابسته‌اند.',
  'هشدار پایان محدودیت فقط وقتی کار می‌کند که برنامه باز باشد؛ با بستن برنامه، تب یا مرورگر هیچ هشدار یا صدایی دریافت نمی‌کنید.',
  'رمز برنامه جلوی کاربر فنی را نمی‌گیرد؛ فقط دسترسی معمولی را محدود می‌کند.',
  'تنها راه بازیابی رمز فراموش‌شده، ۲۴ ساعت صبر کردن (بدون استفاده از برنامه) است.',
]

// Bullet points per version, shown to users who accepted an older one.
export const NOTICE_UPDATES: Record<number, string[]> = {}

const KEY = prefKey('notice')

export const acceptedNoticeVersion = (): number => {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

export const acceptNotice = () => {
  try {
    localStorage.setItem(KEY, String(NOTICE_VERSION))
  } catch {
    // storage unavailable: the notice simply shows again next time
  }
}

export const noticeUpdates = (since: number) =>
  Object.entries(NOTICE_UPDATES)
    .filter(([v]) => Number(v) > since && Number(v) <= NOTICE_VERSION)
    .flatMap(([, notes]) => notes)

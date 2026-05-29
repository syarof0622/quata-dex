// IDX market session guard. Timezone: Asia/Jakarta. Pure functions, no I/O.
import { toDateOrNull, WIB_SUFFIX } from "./format";

export type IDXSessionState =
  | "open_session_1"
  | "open_session_2"
  | "lunch_break"
  | "pre_open"
  | "post_close"
  | "weekend"
  | "holiday";

// Manual placeholder; can be loaded from a public source later.
export const IDX_HOLIDAYS_2026: string[] = []; // ISO "YYYY-MM-DD" in Jakarta

function jakartaParts(d: Date = new Date()) {
  // Format date as Jakarta local time using Intl
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { isoDate, minutes, dow: dayMap[parts.weekday] ?? 0 };
}

export function isIDXTradingDay(d: Date = new Date()): boolean {
  const { isoDate, dow } = jakartaParts(d);
  if (dow === 0 || dow === 6) return false;
  if (IDX_HOLIDAYS_2026.includes(isoDate)) return false;
  return true;
}

export function getIDXMarketSession(d: Date = new Date()): {
  state: IDXSessionState; isOpen: boolean; isBreak: boolean; minutesNow: number;
  label: string;
} {
  const { dow, minutes, isoDate } = jakartaParts(d);
  if (dow === 0 || dow === 6) return { state: "weekend", isOpen: false, isBreak: false, minutesNow: minutes, label: "Weekend" };
  if (IDX_HOLIDAYS_2026.includes(isoDate)) return { state: "holiday", isOpen: false, isBreak: false, minutesNow: minutes, label: "Holiday" };

  const isFriday = dow === 5;
  const s1Start = 9 * 60;
  const s1End = isFriday ? 11 * 60 + 30 : 12 * 60;
  const s2Start = isFriday ? 14 * 60 : 13 * 60 + 30;
  const s2End = 15 * 60 + 49;

  if (minutes < s1Start) return { state: "pre_open", isOpen: false, isBreak: false, minutesNow: minutes, label: "Pre-open" };
  if (minutes < s1End) return { state: "open_session_1", isOpen: true, isBreak: false, minutesNow: minutes, label: "Session I" };
  if (minutes < s2Start) return { state: "lunch_break", isOpen: false, isBreak: true, minutesNow: minutes, label: "Lunch break" };
  if (minutes < s2End) return { state: "open_session_2", isOpen: true, isBreak: false, minutesNow: minutes, label: "Session II" };
  return { state: "post_close", isOpen: false, isBreak: false, minutesNow: minutes, label: "Closed" };
}

export function isIDXMarketOpen(d: Date = new Date()): boolean {
  return getIDXMarketSession(d).isOpen;
}
export function isIDXBreakTime(d: Date = new Date()): boolean {
  return getIDXMarketSession(d).isBreak;
}
export function isIDXMarketClosed(d: Date = new Date()): boolean {
  const s = getIDXMarketSession(d);
  return !s.isOpen && !s.isBreak;
}

export function canExecutePaperTrade(d: Date = new Date()): { ok: boolean; reason?: string } {
  if (!isIDXTradingDay(d)) return { ok: false, reason: "Bukan hari trading IDX (weekend/holiday)." };
  if (!isIDXMarketOpen(d)) return { ok: false, reason: "Pasar IDX sedang tutup atau jeda istirahat." };
  return { ok: true };
}

export function getNextIDXSession(_d: Date = new Date()): string {
  const s = getIDXMarketSession(_d);
  if (s.state === "pre_open") return "Sesi I 09:00 WIB";
  if (s.state === "lunch_break") return "Sesi II";
  if (s.state === "open_session_1" || s.state === "open_session_2") return "Sedang berlangsung";
  return "Hari trading berikutnya 09:00 WIB";
}

/**
 * End of the current IDX trading day in WIB, or the next trading day's
 * 09:00 WIB if today is post-close / weekend / holiday. Returned as a UTC
 * Date so it can be persisted as ISO; UI must render via formatWIB.
 */
export function getEndOfCurrentIDXTradingDayWIB(d: Date = new Date()): Date {
  const s = getIDXMarketSession(d);
  const { isoDate } = jakartaParts(d);
  const [y, m, day] = isoDate.split("-").map(Number);
  const wibToUtc = (year: number, mon: number, dayOfMonth: number, h: number, min: number) =>
    new Date(Date.UTC(year, mon - 1, dayOfMonth, h - 7, min, 0, 0));

  if (
    s.state === "open_session_1" || s.state === "open_session_2" ||
    s.state === "lunch_break" || s.state === "pre_open"
  ) {
    return wibToUtc(y, m, day, 15, 49);
  }
  let probe = new Date(d.getTime());
  for (let i = 0; i < 10; i++) {
    probe = new Date(probe.getTime() + 24 * 60 * 60 * 1000);
    if (isIDXTradingDay(probe)) {
      const p = jakartaParts(probe);
      const [ny, nm, nd] = p.isoDate.split("-").map(Number);
      return wibToUtc(ny, nm, nd, 9, 0);
    }
  }
  return wibToUtc(y, m, day + 1, 9, 0);
}

/** Human label in WIB. Renders "26 Mei 2026, 15:49 WIB" — never UTC/Z. */
export function formatWIB(d: Date | string | null | undefined): string {
  const date = toDateOrNull(d);
  if (!date) return "—";
  try {
    return date.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) + ` ${WIB_SUFFIX}`;
  } catch { return "—"; }
}

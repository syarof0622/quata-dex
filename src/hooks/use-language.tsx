import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { UI_LABELS_ID, translateStatusID } from "@/lib/i18n/id";
import { UI_LABELS_EN, translateStatusEN } from "@/lib/i18n/en";

export type UiLang = "id" | "en";

type Ctx = {
  lang: UiLang;
  setLang: (l: UiLang) => void;
  L: typeof UI_LABELS_ID;
  translateStatus: (s: string | null | undefined) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "quanta:prefs";

function readInitial(): UiLang {
  if (typeof window === "undefined") return "id";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    const v = p.uiLang ?? p.newsLang;
    return v === "en" ? "en" : "id";
  } catch { return "id"; }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("id");

  useEffect(() => {
    const initial = readInitial();
    setLangState(initial);
    if (typeof document !== "undefined") document.documentElement.lang = initial;
  }, []);

  const setLang = useCallback((l: UiLang) => {
    setLangState(l);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const p = raw ? JSON.parse(raw) : {};
      p.uiLang = l;
      p.newsLang = l; // keep news filter in sync
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {/* */}
    if (typeof document !== "undefined") document.documentElement.lang = l;
    // Notify listeners (e.g. news page) that prefs changed.
    try { window.dispatchEvent(new CustomEvent("quanta:lang-change", { detail: { lang: l } })); } catch {/* */}
  }, []);

  const L = (lang === "en" ? (UI_LABELS_EN as unknown as typeof UI_LABELS_ID) : UI_LABELS_ID);
  const translateStatus = lang === "en" ? translateStatusEN : translateStatusID;

  return (
    <LanguageContext.Provider value={{ lang, setLang, L, translateStatus }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Safe fallback for components rendered outside provider (e.g. SSR shell).
    return {
      lang: "id",
      setLang: () => {/* no-op */},
      L: UI_LABELS_ID,
      translateStatus: translateStatusID,
    };
  }
  return ctx;
}

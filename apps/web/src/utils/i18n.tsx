import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { resolveLocale } from "@nivaran/shared";
import { loadFontForLocale } from "./fontLoader.js";

type Translations = Record<string, string>;

interface I18nContextValue {
  locale: string;
  setLocale: (l: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  availableLocales: string[];
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {
    // Default no-op
  },
  t: (key: string) => key,
  availableLocales: ["en"],
});

// Cache for loaded language packs
const languagePacks = new Map<string, Translations>();

async function loadPack(locale: string): Promise<Translations> {
  const norm = locale.toLowerCase().split("-")[0] ?? "en";
  if (languagePacks.has(norm)) {
    return languagePacks.get(norm)!;
  }

  try {
    let pack: { default: Translations };
    if (norm === "hi") {
      pack = await import("../locales/hi.js");
    } else if (norm === "pa") {
      pack = await import("../locales/pa.js");
    } else {
      pack = await import("../locales/en.js");
    }
    languagePacks.set(norm, pack.default);
    return pack.default;
  } catch {
    const fallback = await import("../locales/en.js");
    languagePacks.set(norm, fallback.default);
    return fallback.default;
  }
}

export function I18nProvider({
  children,
  tenantDefaultLocale = "en",
  tenantEnabledLocales = ["en"],
}: {
  children: ReactNode;
  tenantDefaultLocale?: string;
  tenantEnabledLocales?: string[];
}): React.JSX.Element {
  const [currentLocale, setCurrentLocale] = useState<string>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("nivaran_locale") : null;
    return resolveLocale(saved ?? undefined, tenantEnabledLocales, tenantDefaultLocale);
  });

  const [activeTranslations, setActiveTranslations] = useState<Translations>({});
  const [englishFallback, setEnglishFallback] = useState<Translations>({});

  useEffect(() => {
    void loadPack("en").then(setEnglishFallback);
  }, []);

  useEffect(() => {
    // Dynamically load language pack and font
    void loadPack(currentLocale).then((pack) => {
      setActiveTranslations(pack);
      if (typeof window !== "undefined") {
        loadFontForLocale(currentLocale);
        localStorage.setItem("nivaran_locale", currentLocale);
      }
    });
  }, [currentLocale]);

  const setLocale = (l: string) => {
    const resolved = resolveLocale(l, tenantEnabledLocales, tenantDefaultLocale);
    setCurrentLocale(resolved);
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    let text = activeTranslations[key] || englishFallback[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return text;
  };

  return (
    <I18nContext.Provider
      value={{
        locale: currentLocale,
        setLocale,
        t,
        availableLocales: tenantEnabledLocales,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}

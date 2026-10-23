/**
 * Loads web fonts dynamically ONLY for the scripts in use via @fontsource.
 * - Devanagari for Hindi ('hi')
 * - Gurmukhi for Punjabi ('pa')
 * English ('en') uses Public Sans / Barlow Semi Condensed.
 */
const loadedFonts = new Set<string>();

export function loadFontForLocale(locale: string): void {
  if (typeof document === "undefined") return;
  const norm = locale.toLowerCase().split("-")[0] ?? "en";

  if (norm === "hi" && !loadedFonts.has("hi")) {
    loadedFonts.add("hi");
    void import("@fontsource/noto-sans-devanagari")
      .then(() => {
        document.documentElement.lang = "hi";
      })
      .catch((err) => {
        console.warn("Could not load Noto Sans Devanagari", err);
      });
  } else if (norm === "pa" && !loadedFonts.has("pa")) {
    loadedFonts.add("pa");
    void import("@fontsource/noto-sans-gurmukhi")
      .then(() => {
        document.documentElement.lang = "pa";
      })
      .catch((err) => {
        console.warn("Could not load Noto Sans Gurmukhi", err);
      });
  } else if (norm === "en") {
    document.documentElement.lang = "en";
  }
}

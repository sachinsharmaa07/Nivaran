/**
 * Loads web fonts dynamically ONLY for the scripts in use.
 * - Devanagari for Hindi ('hi')
 * - Gurmukhi for Punjabi ('pa')
 * English ('en') uses system font stack / Public Sans.
 */
const loadedFonts = new Set<string>();

export function loadFontForLocale(locale: string): void {
  if (typeof document === "undefined") return;
  const norm = locale.toLowerCase().split("-")[0];

  if (norm === "hi" && !loadedFonts.has("hi")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    loadedFonts.add("hi");
    document.documentElement.style.fontFamily =
      "'Noto Sans Devanagari', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  } else if (norm === "pa" && !loadedFonts.has("pa")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+Gurmukhi:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    loadedFonts.add("pa");
    document.documentElement.style.fontFamily =
      "'Noto Sans Gurmukhi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  } else if (norm === "en") {
    document.documentElement.style.fontFamily =
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  }
}

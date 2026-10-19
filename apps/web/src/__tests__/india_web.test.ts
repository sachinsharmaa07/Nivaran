import { describe, it, expect } from "vitest";
import { resolveLocale } from "@nivaran/shared";

describe("Web India Additions", () => {
  it("resolves locale fallback chain correctly", () => {
    const enabled = ["en", "hi", "pa"];

    // Direct match
    expect(resolveLocale("hi", enabled, "en")).toBe("hi");
    expect(resolveLocale("pa", enabled, "en")).toBe("pa");
    expect(resolveLocale("en", enabled, "en")).toBe("en");

    // Case-insensitive & region prefix match (hi-IN -> hi, pa-IN -> pa, en-US -> en)
    expect(resolveLocale("hi-IN", enabled, "en")).toBe("hi");
    expect(resolveLocale("pa-IN", enabled, "en")).toBe("pa");
    expect(resolveLocale("en-US", enabled, "en")).toBe("en");

    // Fallback to tenant default for unsupported locale (e.g. French -> default 'en' or 'pa')
    expect(resolveLocale("fr", enabled, "pa")).toBe("pa");
    expect(resolveLocale("es", enabled, "en")).toBe("en");
    expect(resolveLocale(undefined, enabled, "hi")).toBe("hi");
  });

  it("checks font loading logic for Devanagari and Gurmukhi scripts", async () => {
    const { loadFontForLocale } = await import("../utils/fontLoader.js");
    expect(typeof loadFontForLocale).toBe("function");

    // Execution without crashing in Node/JSDOM environment
    expect(() => loadFontForLocale("hi")).not.toThrow();
    expect(() => loadFontForLocale("pa")).not.toThrow();
    expect(() => loadFontForLocale("en")).not.toThrow();
  });

  it("exports photo compression utility", async () => {
    const { compressPhoto } = await import("../utils/imageCompression.js");
    expect(typeof compressPhoto).toBe("function");
  });
});

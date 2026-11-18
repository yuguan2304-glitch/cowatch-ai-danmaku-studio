import { describe, expect, it } from "vitest";
import { buildSharedPreset, parseSharedPreset, presetFromHash, presetShareLink, sanitizeAudience } from "@/lib/preset-share";
import { defaultAudience, defaultSettings, DEFAULT_DENSITY } from "@/lib/constants";

describe("viewer preset sharing", () => {
  it("never includes the private world book in a shared preset", () => {
    const a = { ...defaultAudience(), worldBook: "[*] 私人笔记", worldBookEntries: [{ id: "x" }] as never };
    const shared = sanitizeAudience(a);
    expect(shared.worldBook).toBe("");
    expect(shared.worldBookEntries).toEqual([]);
  });

  it("drops fields that are not viewer settings (keys, addresses)", () => {
    const shared = sanitizeAudience({ ...defaultAudience(), apiKey: "abc", baseUrl: "https://x" }) as unknown as Record<string, unknown>;
    expect(shared["apiKey"]).toBeUndefined();
    expect(shared["baseUrl"]).toBeUndefined();
  });

  it("refuses to share a preset whose text contains an API-key-like string", () => {
    const a = { ...defaultAudience(), extraPrompt: "my key sk-abcdefghijklmnopqrstuvwx" };
    expect(() => buildSharedPreset("组", a)).toThrow();
  });

  it("round-trips through a share link fragment", () => {
    const preset = buildSharedPreset("纪录片组", { ...defaultAudience(), identities: { researcher: 60 } });
    const link = presetShareLink("https://example.com", preset);
    expect(link.startsWith("https://example.com/#preset=")).toBe(true);
    const back = presetFromHash(new URL(link).hash);
    expect(back?.name).toBe("纪录片组");
    expect(back?.audience.identities).toEqual({ researcher: 60 });
  });

  it("rejects files that are not CoWatch presets", () => {
    expect(() => parseSharedPreset(JSON.stringify({ format: "other" }))).toThrow();
  });
});

describe("neutral defaults", () => {
  it("default viewers are not fan or ship mode", () => {
    const ids = defaultAudience().identities;
    expect(ids["fan"]).toBeUndefined();
    expect(ids["shipper"]).toBeUndefined();
  });

  it("default density is 35 per minute", () => {
    expect(DEFAULT_DENSITY).toBe(35);
    expect(defaultSettings().generation.density).toBe(35);
  });
});

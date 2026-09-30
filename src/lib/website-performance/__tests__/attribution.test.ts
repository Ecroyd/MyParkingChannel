import { describe, expect, it } from "vitest";
import { classifyAttribution, detectDeviceClass } from "../attribution";

describe("classifyAttribution", () => {
  it("classifies paid UTM", () => {
    expect(
      classifyAttribution({ utmSource: "google", utmMedium: "cpc" })
    ).toBe("paid");
  });

  it("classifies organic search referrer", () => {
    expect(
      classifyAttribution({ referrer: "https://www.google.com/search?q=parking" })
    ).toBe("organic");
  });

  it("classifies social referrer", () => {
    expect(classifyAttribution({ referrer: "https://t.co/abc" })).toBe("social");
  });

  it("returns direct when landing page exists and no referrer/utm", () => {
    expect(classifyAttribution({ landingPage: "/", referrer: "" })).toBe("direct");
  });

  it("does not invent attribution when signals are absent", () => {
    expect(classifyAttribution({})).toBeNull();
  });
});

describe("detectDeviceClass", () => {
  it("detects mobile and desktop", () => {
    expect(detectDeviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)")).toBe("mobile");
    expect(
      detectDeviceClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")
    ).toBe("desktop");
    expect(detectDeviceClass(null)).toBe("unknown");
  });
});

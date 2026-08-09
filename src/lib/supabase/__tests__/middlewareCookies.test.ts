import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { copyAuthCookies } from "@/lib/supabase/middleware";

describe("copyAuthCookies", () => {
  it("copies set-cookie headers onto the target response", () => {
    const from = NextResponse.next();
    from.headers.append(
      "set-cookie",
      "sb-access-token=abc; Path=/; HttpOnly; SameSite=Lax"
    );
    from.headers.append(
      "set-cookie",
      "sb-refresh-token=def; Path=/; HttpOnly; SameSite=Lax"
    );

    const to = NextResponse.rewrite(new URL("https://example.com/sites/demo"));
    copyAuthCookies(from, to);

    const cookies = to.headers.getSetCookie();
    expect(cookies.some((c) => c.includes("sb-access-token=abc"))).toBe(true);
    expect(cookies.some((c) => c.includes("sb-refresh-token=def"))).toBe(true);
  });
});

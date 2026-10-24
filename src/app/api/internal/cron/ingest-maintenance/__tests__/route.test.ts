import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const calls: string[] = [];
vi.mock("../../parse-received/route", () => ({
  GET: async () => {
    calls.push("parse");
    throw new Error("boom");
  },
}));
vi.mock("../../ingest-retry/route", () => ({
  GET: async () => {
    calls.push("retry");
    return Response.json({ ok: true, retried: 0 });
  },
}));

import { GET } from "../route";

afterEach(() => {
  calls.length = 0;
  vi.unstubAllEnvs();
});

describe("ingest-maintenance cron", () => {
  it("rejects calls without a cron credential", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(new NextRequest("https://x/api/internal/cron/ingest-maintenance"));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("runs parse + retry in order even when one throws, and reports failure", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(
      new NextRequest("https://x/api/internal/cron/ingest-maintenance", {
        headers: { authorization: "Bearer s3cret" },
      })
    );
    expect(calls).toEqual(["parse", "retry"]);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.results["parse-received"].error).toBe("boom");
    expect(body.results["ingest-retry"].status).toBe(200);
    expect(body.results["ingest-canary"]).toBeUndefined();
  });
});

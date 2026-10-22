import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { devUserEmail, isAllowedUser } from "@/lib/supabase/config";
import { bearerOk } from "@/lib/api";

vi.mock("@/lib/jobs", () => ({
  ingestJob: vi.fn(async () => ({ status: "ok", counts: {} })),
  morningJob: vi.fn(async () => ({ counts: {} })),
}));

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret-value";
  process.env.ARJUN_EMAIL = "arjun@example.com";
  delete process.env.SM_DEV_USER;
});

const req = (url: string, auth?: string, method = "GET") =>
  new Request(`https://x.test${url}`, { method, headers: auth ? { authorization: auth } : {} });

describe("cron routes (R4)", () => {
  it("reject a missing or wrong bearer, accept the right one", async () => {
    const ingest = await import("@/app/api/cron/ingest/route");
    const morning = await import("@/app/api/cron/morning/route");
    expect((await ingest.GET(req("/api/cron/ingest"))).status).toBe(401);
    expect((await ingest.GET(req("/api/cron/ingest", "Bearer wrong"))).status).toBe(401);
    expect((await morning.GET(req("/api/cron/morning", "s3cret-value"))).status).toBe(401);
    expect((await ingest.GET(req("/api/cron/ingest", "Bearer s3cret-value"))).status).toBe(200);
  });
  it("bearer check fails closed when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    expect(bearerOk(req("/", "Bearer "))).toBe(false);
  });
});

describe("signed-out requests are blocked", () => {
  it("API routes return 401 without a session", async () => {
    const run = await import("@/app/api/run/route");
    const acc = await import("@/app/api/accounts/[id]/route");
    const health = await import("@/app/api/health/route");
    expect((await run.POST(req("/api/run", undefined, "POST"))).status).toBe(401);
    expect((await acc.PATCH(req("/api/accounts/1", undefined, "PATCH"), { params: Promise.resolve({ id: "1" }) })).status).toBe(401);
    expect((await health.GET(req("/api/health"))).status).toBe(401);
  });
  it("the proxy redirects pages to /login and returns 401 for APIs", async () => {
    const { proxy } = await import("@/proxy");
    const page = await proxy(new NextRequest("https://x.test/"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://x.test/login");
    const api = await proxy(new NextRequest("https://x.test/api/tasks/1"));
    expect(api.status).toBe(401);
    const login = await proxy(new NextRequest("https://x.test/login"));
    expect(login.status).toBe(200);
  });
});

describe("test build sign-in", () => {
  it("is refused when SM_TEST_MODE is not true", async () => {
    delete process.env.SM_TEST_MODE;
    const r = await import("@/app/api/test-login/route");
    expect((await r.POST()).status).toBe(403);
  });
  it("is a public route in the proxy only so the login page can call it", async () => {
    const { proxy } = await import("@/proxy");
    expect((await proxy(new NextRequest("https://x.test/api/test-login"))).status).toBe(200);
  });
});

describe("allowed user", () => {
  it("only ARJUN_EMAIL is allowed", () => {
    expect(isAllowedUser("Arjun@Example.com")).toBe(true);
    expect(isAllowedUser("someone@else.com")).toBe(false);
    expect(isAllowedUser(null)).toBe(false);
  });
  it("the dev shortcut is never active in production", () => {
    process.env.SM_DEV_USER = "arjun@example.com";
    vi.stubEnv("NODE_ENV", "production");
    expect(devUserEmail()).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("project on hold", () => {
  it("shows the hold notice on every page and returns 503 for every API, crons included", async () => {
    vi.stubEnv("SM_ON_HOLD", "true");
    const { proxy } = await import("@/proxy");
    const page = await proxy(new NextRequest("https://x.test/"));
    expect(page.headers.get("x-middleware-rewrite")).toBe("https://x.test/hold");
    const login = await proxy(new NextRequest("https://x.test/login"));
    expect(login.headers.get("x-middleware-rewrite")).toBe("https://x.test/hold");
    for (const p of ["/api/cron/ingest", "/api/cron/morning", "/api/run", "/api/tasks/1"]) {
      const r = await proxy(new NextRequest(`https://x.test${p}`));
      expect(r.status).toBe(503);
      expect((await r.json()).error).toMatch(/on hold.*contact ADMIN/i);
    }
    vi.unstubAllEnvs();
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import worker, { normalizeLocationStats, resolvePeriod } from "../src/index.js";

const now = new Date("2026-08-09T04:30:00.000Z");

test("resolves the current month in Tokyo", () => {
  assert.deepEqual(
    resolvePeriod({ range: "month", value: "2026-08", trackingStart: "2026-08-09", now }),
    {
      type: "month",
      value: "2026-08",
      label: "August 2026",
      start: "2026-08-01T00:00:00+09:00",
      end: "2026-08-09T04:30:00.000Z",
    },
  );
});

test("resolves all-time from the tracking start", () => {
  assert.equal(
    resolvePeriod({ range: "all", trackingStart: "2026-08-09", now }).label,
    "Since Aug 9, 2026",
  );
});

test("rejects a period before tracking started", () => {
  assert.throws(
    () => resolvePeriod({ range: "month", value: "2026-07", trackingStart: "2026-08-09", now }),
    /outside the available reporting range/,
  );
});

test("normalizes, aggregates, and sorts location statistics", () => {
  assert.deepEqual(normalizeLocationStats([
    { id: "JP", count: 12 },
    { id: "US-CA", count: 4 },
    { id: "US-NY", count: 3 },
    { id: "", count: 2 },
    { id: "DE", count: 1 },
  ]), {
    visits: 22,
    countryCount: 3,
    countries: [
      { code: "JP", visits: 12 },
      { code: "US", visits: 7 },
      { code: "DE", visits: 1 },
    ],
  });
});

test("serves only normalized aggregate data with CORS", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  let cachedResponse;

  globalThis.caches = {
    default: {
      match: async () => null,
      put: async (_key, response) => {
        cachedResponse = response;
      },
    },
  };
  globalThis.fetch = async (request, init = {}) => {
    const url = new URL(request instanceof Request ? request.url : request);
    assert.equal(url.hostname, "boxuan-lyu.goatcounter.com");
    assert.equal(url.pathname, "/api/v0/stats/locations");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer secret-token");
    return new Response(JSON.stringify({
      stats: [{ id: "JP", count: 3 }, { id: "US", count: 2 }],
      more: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const pending = [];
    const response = await worker.fetch(
      new Request("https://stats.example/stats?range=all", {
        headers: { Origin: "https://boxuan-lyu.github.io" },
      }),
      {
        GOATCOUNTER_TOKEN: "secret-token",
        GOATCOUNTER_CODE: "boxuan-lyu",
        TRACKING_START: "2026-08-09",
        ALLOWED_ORIGINS: "https://boxuan-lyu.github.io",
      },
      { waitUntil: (promise) => pending.push(promise) },
    );
    const data = await response.json();
    await Promise.all(pending);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://boxuan-lyu.github.io");
    assert.equal(data.visits, 5);
    assert.equal(data.countryCount, 2);
    assert.deepEqual(data.countries, [{ code: "JP", visits: 3 }, { code: "US", visits: 2 }]);
    assert.ok(cachedResponse);
    assert.equal(JSON.stringify(data).includes("secret-token"), false);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const jsonResponse = (data, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
};

const getTokyoDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
};

const pad = (value) => String(value).padStart(2, "0");
const tokyoMidnight = (year, month, day) => `${year}-${pad(month)}-${pad(day)}T00:00:00+09:00`;

const nextMonth = (year, month) => month === 12
  ? { year: year + 1, month: 1 }
  : { year, month: month + 1 };

const formatTrackingStart = (value) => {
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) || [];
  if (!year) throw new Error("TRACKING_START must use YYYY-MM-DD");
  return `${SHORT_MONTH_NAMES[Number(month) - 1]} ${Number(day)}, ${year}`;
};

export const resolvePeriod = ({ range, value, trackingStart, now = new Date() }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trackingStart)) {
    throw new Error("TRACKING_START must use YYYY-MM-DD");
  }

  const today = getTokyoDate(now);
  const currentMonth = `${today.year}-${pad(today.month)}`;
  const firstTrackedMonth = trackingStart.slice(0, 7);
  const firstTrackedYear = Number(trackingStart.slice(0, 4));
  const nowIso = now.toISOString();

  if (range === "month") {
    if (!/^\d{4}-\d{2}$/.test(value || "")) throw new Error("Month value must use YYYY-MM");
    const [year, month] = value.split("-").map(Number);
    if (month < 1 || month > 12 || value < firstTrackedMonth || value > currentMonth) {
      throw new Error("Month is outside the available reporting range");
    }
    const following = nextMonth(year, month);
    return {
      type: "month",
      value,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      start: tokyoMidnight(year, month, 1),
      end: value === currentMonth ? nowIso : tokyoMidnight(following.year, following.month, 1),
    };
  }

  if (range === "year") {
    if (!/^\d{4}$/.test(value || "")) throw new Error("Year value must use YYYY");
    const year = Number(value);
    if (year < firstTrackedYear || year > today.year) {
      throw new Error("Year is outside the available reporting range");
    }
    return {
      type: "year",
      value,
      label: String(year),
      start: tokyoMidnight(year, 1, 1),
      end: year === today.year ? nowIso : tokyoMidnight(year + 1, 1, 1),
    };
  }

  if (range === "all") {
    const [year, month, day] = trackingStart.split("-").map(Number);
    return {
      type: "all",
      value: "all",
      label: `Since ${formatTrackingStart(trackingStart)}`,
      start: tokyoMidnight(year, month, day),
      end: nowIso,
    };
  }

  throw new Error("Range must be month, year, or all");
};

export const normalizeLocationStats = (stats) => {
  const countryTotals = new Map();
  let visits = 0;

  for (const item of stats) {
    const count = Number(item.count);
    if (!Number.isFinite(count) || count < 0) continue;
    visits += count;

    const rawId = String(item.id || "").toUpperCase();
    const code = rawId.match(/^[A-Z]{2}/)?.[0];
    if (!code) continue;
    countryTotals.set(code, (countryTotals.get(code) || 0) + count);
  }

  const countries = [...countryTotals.entries()]
    .map(([code, countryVisits]) => ({ code, visits: countryVisits }))
    .filter((country) => country.visits > 0)
    .sort((a, b) => b.visits - a.visits || a.code.localeCompare(b.code));

  return { visits, countryCount: countries.length, countries };
};

const fetchLocationStats = async (env, period) => {
  if (!env.GOATCOUNTER_TOKEN) throw new Error("GOATCOUNTER_TOKEN is not configured");
  if (!/^[a-z0-9-]+$/.test(env.GOATCOUNTER_CODE || "")) throw new Error("Invalid GOATCOUNTER_CODE");

  const allStats = [];
  let offset = 0;

  for (let page = 0; page < 4; page += 1) {
    const url = new URL(`https://${env.GOATCOUNTER_CODE}.goatcounter.com/api/v0/stats/locations`);
    url.searchParams.set("start", period.start);
    url.searchParams.set("end", period.end);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.GOATCOUNTER_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) throw new Error(`GoatCounter returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.stats)) throw new Error("GoatCounter returned an invalid response");
    allStats.push(...data.stats);
    if (!data.more || data.stats.length === 0) break;
    offset += data.stats.length;
  }

  return allStats;
};

const allowedOrigin = (request, env) => {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(origin) ? origin : "";
};

const withCors = (response, origin) => {
  const headers = new Headers(response.headers);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (!origin) return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
      return withCors(new Response(null, { status: 204 }), origin);
    }

    if (request.method !== "GET") {
      return withCors(jsonResponse({ error: "Method not allowed" }, { status: 405 }), origin);
    }

    if (url.pathname === "/health") {
      return withCors(jsonResponse({ ok: true }), origin);
    }

    if (url.pathname !== "/stats") {
      return withCors(jsonResponse({ error: "Not found" }, { status: 404 }), origin);
    }

    if (request.headers.has("Origin") && !origin) {
      return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
    }

    let period;
    try {
      period = resolvePeriod({
        range: url.searchParams.get("range") || "month",
        value: url.searchParams.get("value"),
        trackingStart: env.TRACKING_START || "2026-08-09",
      });
    } catch (error) {
      return withCors(jsonResponse({ error: error.message }, { status: 400 }), origin);
    }

    const cacheUrl = new URL(request.url);
    cacheUrl.hostname = "visitor-stats-cache.invalid";
    cacheUrl.searchParams.set("periodEndHour", period.end.slice(0, 13));
    const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached, origin);

    try {
      const stats = await fetchLocationStats(env, period);
      const normalized = normalizeLocationStats(stats);
      const response = jsonResponse({
        period: {
          type: period.type,
          value: period.value,
          label: period.label,
          start: period.start,
          end: period.end,
        },
        ...normalized,
        updatedAt: new Date().toISOString(),
      }, {
        headers: { "Cache-Control": "public, max-age=900, s-maxage=3600" },
      });
      context.waitUntil(cache.put(cacheKey, response.clone()));
      return withCors(response, origin);
    } catch (error) {
      console.error("Visitor statistics request failed", error.message);
      return withCors(jsonResponse({ error: "Statistics are temporarily unavailable" }, {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }), origin);
    }
  },
};

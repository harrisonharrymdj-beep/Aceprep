// src/app/api/track/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------
// Best-effort in-memory rate limit
// NOTE: In serverless, memory may reset between invocations.
// Still useful to dampen accidental spam.
// -----------------------------
const RL_WINDOW_MS = 60_000; // 1 min
const RL_MAX = 120; // per key per window (tune as needed)

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateLimit(key: string) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
    return { ok: true, remaining: RL_MAX - 1 };
  }
  if (b.count >= RL_MAX) return { ok: false, remaining: 0 };
  b.count += 1;
  buckets.set(key, b);
  return { ok: true, remaining: RL_MAX - b.count };
}

// -----------------------------
// Helpers
// -----------------------------
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSnakeCase(s: string) {
  // allow snake_case with digits
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(s);
}

function clampString(s: string, max = 240) {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function safeNumber(n: unknown, fallback: number) {
  const x = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return x;
}

function normalizePath(p: unknown) {
  if (typeof p !== "string") return "/";
  // keep it simple, no query strings
  const clean = p.split("?")[0] || "/";
  return clampString(clean, 200);
}

const FORBIDDEN_KEYS = new Set([
  // user content / potentially sensitive
  "materials",
  "userAnswer",
  "answerKey",
  "raw",
  "rawText",
  "rawOutput",
  "output",
  "aiOutput",
  "response",
  "data",
  // common big blobs
  "text",
  "content",
  "prompt",
]);

function sanitizePayload(input: unknown): Record<string, string | number | boolean | null> {
  // PostHog-friendly: flat props only
  if (!isPlainObject(input)) return {};

  const out: Record<string, string | number | boolean | null> = {};
  const entries = Object.entries(input);

  // cap how many keys we accept
  for (const [kRaw, v] of entries.slice(0, 40)) {
    const k = String(kRaw);

    // drop forbidden keys
    if (FORBIDDEN_KEYS.has(k)) continue;

    // drop nested objects/arrays (keep payload flat)
    if (typeof v === "object" && v !== null) continue;

    // normalize primitives and cap strings
    if (typeof v === "string") out[k] = clampString(v, 240);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (v === null || v === undefined) out[k] = null;
  }

  return out;
}

function getIpFromHeaders(h: Headers) {
  // best effort; do not store IP (GDPR-friendly)
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return h.get("x-real-ip") || "unknown";
}

// -----------------------------
// Route
// -----------------------------
export async function POST(req: Request) {
  try {
    const h = await headers();
    const ip = getIpFromHeaders(h);
    const ua = req.headers.get("user-agent") || "";

    // Basic rate limiting by IP + UA hash-ish (best effort)
    const rlKey = `${ip}:${ua.slice(0, 40) || "ua"}`;
    const rl = rateLimit(rlKey);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!isPlainObject(body)) {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const event = typeof body.event === "string" ? body.event : "";
    if (!event || event.length > 80 || !isSnakeCase(event)) {
      return NextResponse.json(
        { ok: false, error: "invalid_event" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const sessionId = typeof body.sessionId === "string" ? clampString(body.sessionId, 120) : "unknown";
    const path = normalizePath(body.path);
    const ts = safeNumber(body.ts, Date.now());

    // Payload must be flat + scrubbed
    const payload = sanitizePayload(body.payload);

    // Ensure standard props exist and are safe
    // tier/tool should be included client-side; we keep them if present, otherwise omit.
    const properties = {
      ...payload,
      sessionId,
      path,
      // User agent can be included optionally (per your plan). Keep it short.
      userAgent: body.userAgent ? clampString(String(body.userAgent), 200) : clampString(ua, 200),
    };

    // Final scrub: never allow forbidden keys (in case client sent them)
    for (const k of Object.keys(properties)) {
      if (FORBIDDEN_KEYS.has(k)) delete (properties as any)[k];
    }

    const eventRow = {
      event,
      properties,
      ts,
    };

    // ✅ This is “real” analytics: it hits a server endpoint.
    // For now, we store nothing (GDPR/FERPA safe) and just log server-side.
    // You can later persist to DB/queue or forward to PostHog here.

    // TODO: forward events to PostHog (server-side) using event + properties

    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[track]", eventRow);
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Never block UI; return fast failure
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

// Optional: if you ever call this cross-origin, you can handle OPTIONS.
// Same-origin fetch/sendBeacon usually doesn't need it, but it doesn't hurt.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

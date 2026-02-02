// src/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Clipboard,
  Code2,
  Crown,
  FileDown,
  Loader2,
  Lock,
  Shield,
  Sparkles,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Tool =
  | "study_guide"
  | "formula_sheet"
  | "flashcards"
  | "planner"
  | "reviewer"
  | "essay_outline"
  | "essay_proofread";

type Tier = "free" | "pro";

const BRAND_LINE = "Study smarter. Learn honestly.";

const TOOLS: Array<{
  id: Tool;
  label: string;
  short: string;
  heavy: boolean;
  needs: {
    materials?: boolean;
    course?: boolean;
    topic?: boolean;
    examDate?: boolean;
    userAnswer?: boolean;
    answerKey?: boolean;
  };
}> = [
  {
    id: "study_guide",
    label: "Study Guide Maker",
    short: "Study Guide",
    heavy: true,
    needs: { materials: true, course: true, topic: true },
  },
  {
    id: "formula_sheet",
    label: "Formula Sheet Builder",
    short: "Formula Sheet",
    heavy: true,
    needs: { materials: true, course: true, topic: true },
  },
  {
    id: "reviewer",
    label: "Homework/Quiz Reviewer",
    short: "Reviewer",
    heavy: true,
    needs: { materials: true, course: true, topic: true, userAnswer: true, answerKey: true },
  },
  {
    id: "flashcards",
    label: "Flashcards",
    short: "Flashcards",
    heavy: false,
    needs: { materials: true, course: true, topic: true },
  },
  {
    id: "planner",
    label: "Study Week Planner",
    short: "Planner",
    heavy: false,
    needs: { materials: true, course: true, topic: true, examDate: true },
  },
  {
    id: "essay_outline",
    label: "Essay Outliner",
    short: "Outline",
    heavy: true,
    needs: { materials: true, course: true, topic: true },
  },
  {
    id: "essay_proofread",
    label: "Essay Proofreader",
    short: "Proofread",
    heavy: true,
    needs: { materials: true, course: true, topic: true, userAnswer: true }, // reuse userAnswer as "essay text"
  },
];

const DEFAULT_TOOL: Tool = "study_guide";

const AD_SECONDS = 15;

const adImpressionDedupe = new Set<string>();

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function isBrowser() {
  return typeof window !== "undefined";
}

function makeSessionId() {
  // not crypto-perfect; fine for MVP.
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const FORBIDDEN_PAYLOAD_KEYS = new Set(["materials", "userAnswer", "answerKey", "raw", "rawText", "output", "data"]);

function track(event: string, payload?: Record<string, any>) {
  try {
    const ts = Date.now();

    // Minimal / safe payload scrub (flat metadata only)
    const safePayload: Record<string, any> = {};
    const input = payload ?? {};

    for (const [k, v] of Object.entries(input)) {
      if (FORBIDDEN_PAYLOAD_KEYS.has(k)) continue;
      // Keep payload flat — drop nested objects/arrays
      if (v && typeof v === "object") continue;
      safePayload[k] = v;
    }

    const sessionId =
      typeof window !== "undefined"
        ? window.localStorage.getItem("aceprep_sessionId") || "unknown"
        : "server";

    const path = typeof window !== "undefined" ? window.location.pathname : "/";

    const item = {
      event,
      payload: safePayload,
      ts,
      sessionId,
      path,
      // Optional: userAgent (short). Server also sees UA headers.
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };

    // Console for dev visibility
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[track]", item);
    }

    // Optional localStorage queue (can remain)
    if (typeof window !== "undefined") {
      const key = "aceprep_events";
      const prev = JSON.parse(window.localStorage.getItem(key) || "[]");
      prev.push({ event, payload: safePayload, ts });
      window.localStorage.setItem(key, JSON.stringify(prev.slice(-500)));
    }

    // Fire-and-forget send
    sendEvent(item);
  } catch {
    // ignore
  }

  function sendEvent(item: {
    event: string;
    payload: Record<string, any>;
    ts: number;
    sessionId: string;
    path: string;
    userAgent?: string;
  }) {
    try {
      if (typeof window === "undefined") return;

      // Enforce standard props on every event (PostHog-friendly)
      // NOTE: tier/tool are added by callers in payload already, but we don't force here.
      const body = JSON.stringify({
        event: item.event,
        payload: item.payload,
        ts: item.ts,
        sessionId: item.sessionId,
        path: item.path,
        userAgent: item.userAgent,
      });

      // Prefer sendBeacon (doesn't block navigation)
      const navAny: any = navigator;
      if (typeof navAny.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        navAny.sendBeacon("/api/track", blob);
        return;
      }

      // Fallback fetch keepalive
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore
    }
  }
}


function getBaseUrl() {
  // Browser
  if (typeof window !== "undefined") return "";

  // Server (Vercel/Prod)
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;

  // Server (local dev)
  return "http://localhost:3000";
}

function AdImpressionPing({ event, slot }: { event: string; slot: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const key = `${path}:${event}:${slot}`;
    if (adImpressionDedupe.has(key)) return;
    adImpressionDedupe.add(key);
    track(event, { slot });
  }, [event, slot]);

  return null;
}



export default function Page() {
  const [selectedTool, setSelectedTool] = useState<Tool>(DEFAULT_TOOL);
  const [tier, setTier] = useState<Tier>("free");

  const [course, setCourse] = useState("");
  const [topic, setTopic] = useState("");
  const [materials, setMaterials] = useState("");
  const [examDate, setExamDate] = useState(""); // YYYY-MM-DD
  const [userAnswer, setUserAnswer] = useState("");
  const [answerKey, setAnswerKey] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [apiResult, setApiResult] = useState<any | null>(null);
  const [policyRefused, setPolicyRefused] = useState<{ refused: boolean; reason: string | null } | null>(null);

  const [showAdOverlay, setShowAdOverlay] = useState(false);
  const [adRemaining, setAdRemaining] = useState(0);

  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownTimerRef = useRef<number | null>(null);
  const adTimerRef = useRef<number | null>(null);

  const [limits, setLimits] = useState<{ remainingToday: number; cooldownSeconds: number } | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);

  const toolMeta = useMemo(() => TOOLS.find((t) => t.id === selectedTool)!, [selectedTool]);
  const isHeavyTool = toolMeta.heavy;
  const needsVideoAd = tier === "free" && isHeavyTool;

const canGenerate = useMemo(() => {
  if (cooldownRemaining > 0) return false;
  if (isGenerating) return false;

  // materials required for all tools in your config
  if (toolMeta.needs.materials && materials.trim().length === 0) return false;

  // planner
  if (selectedTool === "planner" && examDate.trim().length === 0) return false;

  // reviewer
  if (selectedTool === "reviewer" && userAnswer.trim().length === 0) return false;

  // essay proofread (essay text lives in userAnswer)
  if (selectedTool === "essay_proofread" && userAnswer.trim().length === 0) return false;

  // if you truly want answerKey REQUIRED because your TOOLS.needs says so:
  // (BUT your UI says optional — so either enforce it here OR change TOOLS.needs.answerKey to false)
  // if (selectedTool === "reviewer" && toolMeta.needs.answerKey && answerKey.trim().length === 0) return false;

  return true;
}, [
  cooldownRemaining,
  isGenerating,
  toolMeta.needs.materials,
  materials,
  selectedTool,
  examDate,
  userAnswer,
  answerKey,
]);


  // Create/keep a sessionId for MVP
  const sessionId = useMemo(() => {
    if (!isBrowser()) return "server";
    const key = "aceprep_sessionId";
    const existing = window.localStorage.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const created = makeSessionId();
    window.localStorage.setItem(key, created);
    return created;
  }, []);

  const adRemainingRef = useRef(0);
useEffect(() => {
  adRemainingRef.current = adRemaining;
}, [adRemaining]);


  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (adTimerRef.current) window.clearInterval(adTimerRef.current);
      if (cooldownTimerRef.current) window.clearInterval(cooldownTimerRef.current);
    };
  }, []);

function startAdCountdown() {
  track("ad_overlay_shown", { tool: selectedTool, tier, seconds: AD_SECONDS });
  track("ad_video_started", { tool: selectedTool, tier, seconds: AD_SECONDS });

  setShowAdOverlay(true);
  setAdRemaining(AD_SECONDS);


  if (adTimerRef.current) window.clearInterval(adTimerRef.current);
  adTimerRef.current = window.setInterval(() => {
    setAdRemaining((s) => {
      const next = Math.max(0, s - 1);
      if (next === 0) {
        if (adTimerRef.current) window.clearInterval(adTimerRef.current);
        adTimerRef.current = null;
        setShowAdOverlay(false);
        track("ad_video_completed", { tool: selectedTool, tier, seconds: AD_SECONDS });
      }
      return next;
    });
  }, 1000);
}


  function startCooldown(seconds: number) {
    if (seconds <= 0) return;
    setCooldownRemaining(seconds);

    if (cooldownTimerRef.current) window.clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = window.setInterval(() => {
      setCooldownRemaining((s) => {
        const next = Math.max(0, s - 1);
        if (next === 0) {
          if (cooldownTimerRef.current) window.clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
        }
        return next;
      });
    }, 1000);
  }
  

async function onGenerate() {
  // Blocked by cooldown
  if (cooldownRemaining > 0) {
    track("generation_blocked_cooldown", {
      tool: selectedTool,
      tier,
      cooldownRemaining,
    });
    return;
  }

  setError(null);
  setApiResult(null);
  setPolicyRefused(null);
  setModelUsed(null);
  setLimits(null);

  // IMPORTANT: start ad overlay immediately (free + heavy),
  // but DO NOT wait before firing the API request.
  if (needsVideoAd) startAdCountdown();

  setIsGenerating(true);

  const payload = {
    tool: selectedTool,
    tier,
    input: {
      topic: topic.trim() || undefined,
      course: course.trim() || undefined,
      materials,
      userAnswer: userAnswer.trim() || undefined,
      answerKey: answerKey.trim() || undefined,
      constraints:
        selectedTool === "planner" && examDate.trim()
          ? { examDate: examDate.trim(), style: tier === "free" ? "concise" : "detailed" }
          : { style: tier === "free" ? "concise" : "detailed" },
    },
    meta: {
      sessionId,
      clientTs: Date.now(),
    },
  };

  track("generation_started", { tool: selectedTool, tier, heavy: isHeavyTool });

  let res: Response;

  try {
    res = await fetch("/api/aceprep", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aceprep-debug": "1",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (e) {
    console.log("FETCH THREW (never reached server):", e);
    setError("Network error (request did not reach server).");
    setIsGenerating(false);
    return;
  }

  const rawText = await res.text();

  let json: any = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    // keep rawText
  }

  console.log("ACEPREP STATUS:", res.status);
  console.log("ACEPREP RAW:", rawText);

  if (!res.ok || json?.ok === false) {
    const msg =
      json?.error ||
      json?.message ||
      json?.debug?.second?.message ||
      json?.debug?.first?.message ||
      rawText ||
      `AcePrep failed (${res.status})`;

    setError(msg);
    setIsGenerating(false);

    // If request fails, kill overlay
    if (needsVideoAd) {
      setShowAdOverlay(false);
      setAdRemaining(0);
    }
    return;
  }

  // success path
  setModelUsed(json.modelUsed ?? null);
  setLimits(json.limits ?? null);

  const cd = Number(json?.limits?.cooldownSeconds ?? 0);
  if (cd > 0) startCooldown(cd);

  const refused = !!json?.policy?.refused;
  const reason = (json?.policy?.reason ?? null) as string | null;
  setPolicyRefused({ refused, reason });

  // HOLD OUTPUT until ad finishes (if needed)
  if (needsVideoAd) {
    await new Promise<void>((resolve) => {
      const t = window.setInterval(() => {
        if (adRemainingRef.current === 0) {
          window.clearInterval(t);
          resolve();
        }
      }, 250);
    });
  }

  track("generation_completed", {
    tool: selectedTool,
    tier,
    heavy: isHeavyTool,
    modelUsed: json?.modelUsed ?? null,
  });

  setApiResult(json);
  setIsGenerating(false);
}



  async function copyOutput() {
    try {
      const text = apiResult?.data ? JSON.stringify(apiResult.data, null, 2) : "";
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }


  const showStationaryAds = true; // MVP

  return (
    <main className="min-h-screen bg-background text-foreground">
      <StickyHeader tier={tier} setTier={setTier} />

            <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
          {/* LEFT RAIL */}
          <aside className="hidden xl:flex xl:flex-col gap-4 pt-10">
            <SideRailAds />
          </aside>

          {/* CENTER CONTENT */}
          <div className="space-y-12">
            {/* Hero */}
            <section className="pt-14 sm:pt-18">
              <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      AcePrep
                    </Badge>
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      <Shield className="mr-1 h-3.5 w-3.5" />
                      {BRAND_LINE}
                    </Badge>
                  </div>

                  <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    Smarter studying for STEM students — without cheating
                  </h1>

                  <p className="text-lg text-muted-foreground">
                    Turn notes, slides, and formulas into structured study guides with ethical guardrails.
                  </p>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      size="lg"
                      className="rounded-2xl"
                      onClick={() => document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" })}
                    >
                      Start studying <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="rounded-2xl"
                      onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
                    >
                      See how it works
                    </Button>
                  </div>

                  <Card className="rounded-3xl border-dashed">
                    <CardContent className="space-y-3 p-5">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Use AcePrep right now</p>
                        <p className="text-sm text-muted-foreground">
                          Paste your materials and generate a study guide in seconds.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          className="rounded-2xl"
                          onClick={() => document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" })}
                        >
                          Continue as guest
                        </Button>
                        <Button variant="outline" className="rounded-2xl" asChild>
                          <Link href="/login">Sign in</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4" />
                      Ethical AI guardrails
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Transparent model use
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      No answer dumping
                    </div>
                  </div>
                </div>

                {/* Right hero card */}
                <Card className="rounded-3xl">
                  <CardHeader>
                    <CardTitle className="text-base">What you’ll get</CardTitle>
                    <CardDescription>Structured output designed for active recall.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <MiniRow title="Core Concepts + common pitfalls" />
                    <MiniRow title="Practice questions (no answers)" />
                    <MiniRow title="Study order + recall prompts" />
                    <Separator />
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span>Free tier shows ads on heavy tools.</span>
                      <span>Ads keep AcePrep free for students.</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Tools */}
            <section id="tools" className="pb-10">
              <Card className="rounded-3xl">
                <CardHeader className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-xl">Try it now</CardTitle>
                      <CardDescription>Pick a tool, paste your materials, and generate.</CardDescription>
                    </div>

                    {/* Tier toggle */}
                    <div className="flex items-center gap-2">
                      <Badge variant={tier === "free" ? "secondary" : "outline"} className="rounded-full px-3 py-1">
                        {tier === "free" ? "Free" : "Pro"}
                      </Badge>
                      <div className="flex gap-1 rounded-2xl border p-1">
                        <Button
                          size="sm"
                          variant={tier === "free" ? "default" : "ghost"}
                          className="rounded-xl"
                          onClick={() => setTier("free")}
                        >
                        Free
                        </Button>
                          <Button
                            variant={tier === "pro" ? "default" : "outline"}
                            className="rounded-2xl"
                            onClick={() => {
                              track("pro_upgrade_clicked", { location: "header_upgrade", tier });
                              setTier("pro");
                            }}
                          >
                          Pro
                        </Button>
                      </div>
                    </div>
                  </div>

                  <ToolTabs selected={selectedTool} onSelect={setSelectedTool} />
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Inputs */}
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Materials</label>
                      <textarea
                        className="min-h-[180px] w-full rounded-2xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Paste lecture notes, slides text, or a problem description…"
                        value={materials}
                        onChange={(e) => setMaterials(e.target.value)}
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Tip: paste raw text from slides/notes for best results.</span>
                        {modelUsed ? (
                          <span className="rounded-full border px-2 py-0.5">Model: {modelUsed}</span>
                        ) : (
                          <span className="rounded-full border px-2 py-0.5">Model: (shown after generate)</span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Course (optional)" value={course} onChange={setCourse} placeholder="ECE 201 — Digital Logic" />
                      <Field label="Topic (optional)" value={topic} onChange={setTopic} placeholder="K-maps, FFs, FSMs…" />
                    </div>

                    {selectedTool === "planner" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Exam date (required)"
                          value={examDate}
                          onChange={setExamDate}
                          placeholder="YYYY-MM-DD"
                          type="date"
                        />
                        <div className="rounded-2xl border p-3 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">MVP note</p>
                          <p className="mt-1">Time blocks upload comes later. For now, we’ll build a week plan from your materials + date.</p>
                        </div>
                      </div>
                    ) : null}

                    {selectedTool === "reviewer" ? (
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <label className="text-sm font-medium">Your answer (required)</label>
                          <textarea
                            className="min-h-[120px] w-full rounded-2xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            placeholder="Paste what you wrote / your solution attempt…"
                            value={userAnswer}
                            onChange={(e) => setUserAnswer(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            If you don’t provide an answer key, AcePrep will give hints/checks but won’t dump final answers.
                          </p>
                        </div>

                        <div className="grid gap-2">
                          <label className="text-sm font-medium">Answer key (optional)</label>
                          <textarea
                            className="min-h-[90px] w-full rounded-2xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            placeholder="Paste the official solution / answer key (optional)…"
                            value={answerKey}
                            onChange={(e) => setAnswerKey(e.target.value)}
                          />
                        </div>
                      </div>
                    ) : null}

                    {selectedTool === "essay_proofread" ? (
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Essay text (required)</label>
                        <textarea
                          className="min-h-[160px] w-full rounded-2xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                          placeholder="Paste your essay draft…"
                          value={userAnswer}
                          onChange={(e) => setUserAnswer(e.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* Controls */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="rounded-full">
                        Tool: {toolMeta.short}
                      </Badge>
                      <Badge variant={isHeavyTool ? "outline" : "secondary"} className="rounded-full">
                        {isHeavyTool ? "Heavy tool" : "Light tool"}
                      </Badge>

                      {limits ? (
                        <Badge variant="outline" className="rounded-full">
                          Remaining today: {limits.remainingToday}
                        </Badge>
                      ) : null}

                      {cooldownRemaining > 0 ? (
                        <Badge variant="outline" className="rounded-full">
                          <Timer className="mr-1 h-3.5 w-3.5" />
                          Cooldown: {cooldownRemaining}s
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={onGenerate} disabled={!canGenerate} className="rounded-2xl" size="lg">
                        {isGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating…
                          </>
                        ) : tier === "free" && isHeavyTool ? (
                          <>
                            Generate (watch ad) <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        ) : (
                          <>
                            Generate <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        className="rounded-2xl"
                        size="lg"
                        onClick={() => {
                          setApiResult(null);
                          setError(null);
                          setPolicyRefused(null);
                          setModelUsed(null);
                          setLimits(null);
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>

                  {/* Output placeholder */}
                  <div id="how" className="space-y-3">
  {/* Output header */}
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="space-y-1">
      <p className="text-sm font-semibold">Generated output</p>
      <p className="text-xs text-muted-foreground">
        {policyRefused?.refused
          ? "Blocked by ethics guardrails."
          : apiResult?.data
            ? "Review, copy, or export."
            : "Generate to see results here."}
      </p>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        className="rounded-2xl"
        onClick={copyOutput}
        disabled={!apiResult?.data}
      >
        <Clipboard className="mr-2 h-4 w-4" />
        Copy JSON
      </Button>

      <ExportButtons tier={tier} enabled={!!apiResult?.data} />
    </div>
  </div>

  {/* Output body */}
  {isGenerating ? (
    <SkeletonOutput />
  ) : error ? (
    <ErrorCard message={error} onRetry={onGenerate} />
  ) : policyRefused?.refused ? (
    <RefusalCard reason={policyRefused.reason} selectedTool={selectedTool} />
  ) : apiResult?.data ? (
    <OutputRenderer tool={selectedTool} data={apiResult.data} />
  ) : (
    <Card className="rounded-3xl">
      <CardContent className="p-6 text-sm text-muted-foreground">
        Paste materials above and click <span className="font-medium text-foreground">Generate</span>.
      </CardContent>
    </Card>
  )}
</div>

                </CardContent>
              </Card>
            </section>
          </div>

          {/* RIGHT RAIL (keeps the 3-col grid valid) */}
          <aside className="hidden xl:flex xl:flex-col gap-4 pt-10">
            <SideRailAds showUpsell />
          </aside>
        </div>
      </div>


      {/* Ethics */}
      <section id="ethics" className="mx-auto max-w-6xl px-4 pb-12">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-2xl">Built ethically. On purpose.</CardTitle>
            <CardDescription>Designed for learning — not shortcuts.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-medium">No cheating / no answer dumping.</span> We help you understand and practice.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-medium">No hate, harassment, or illegal content.</span> Guardrails stay on.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-medium">Transparent AI usage.</span> We show model used in the response metadata.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-medium">Designed for learning.</span> Active recall, ordering, and practice prompts.
                </span>
              </li>
            </ul>

            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="text-base">Ad-free studying</CardTitle>
                <CardDescription>Remove the 15s overlay and unlock exports.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full rounded-2xl"
                  onClick={() => {
                    track("pro_upgrade_clicked", { location: "tier_toggle", tier });
                    setTier("pro");
                  }}                >
                  <Link href="#pricing">Upgrade to Pro</Link>
                </Button>
                <p className="text-xs text-muted-foreground">Free tier is supported by ads on heavy tools.</p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
          <p className="text-muted-foreground">Simple, student-friendly.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <PricingCard
            title="Free"
            price="$0"
            subtitle="Ads supported"
            bullets={[
              "Core tools",
              "Heavy tools: ads during generation",
              "10 heavy generations/day",
              "Copy output",
              "Limited history (MVP)",
            ]}
            ctaLabel="Keep using Free"
            ctaHref="#tools"
            variant="outline"
          />

          <PricingCard
            title="Pro"
            price="$6.99/mo"
            subtitle="Ad-free + exports"
            bullets={[
              "No ads",
              "Higher limits",
              "Faster feel (UX)",
              "Saved Study Caves (MVP stub)",
              "Exports: PDF / Notion / Anki CSV (MVP stub)",
            ]}
            ctaLabel="Go Pro"
            ctaHref="/checkout?plan=pro"
            variant="default"
            highlight
            onCtaClick={() => track("pro_upgrade_clicked", { location: "pricing", tier })}
          />
        </div>

        {/* Footer ads (2) */}
        {showStationaryAds ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <StationaryAdSlot id="footer_1" title="Ad" subtitle="Sponsored" slotLocation="footer" />
            <StationaryAdSlot id="footer_2" title="Ad" subtitle="Sponsored" slotLocation="footer" />


          </div>
        ) : null}

        <Footer />
      </section>

      {/* Video ad overlay */}
      {/* Video ad overlay */}
    {showAdOverlay ? (
  <AdOverlay
    remaining={adRemaining}
    showAlmostDone={isGenerating && !apiResult && adRemaining === 0}
  />
) : null}

    </main>
  );
}

/* -----------------------------
   Header
----------------------------- */

function StickyHeader({ tier, setTier }: { tier: Tier; setTier: (t: Tier) => void }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl border">
            <Code2 className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">AcePrep</span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          <a href="#tools" className="text-sm text-muted-foreground hover:text-foreground">
            Tools
          </a>
          <a href="#ethics" className="text-sm text-muted-foreground hover:text-foreground">
            Ethics
          </a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant={tier === "pro" ? "default" : "outline"}
            className="rounded-2xl"
            onClick={() => setTier("pro")}
          >
            <Crown className="mr-2 h-4 w-4" />
            Upgrade
          </Button>
          <Button variant="ghost" className="rounded-2xl" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* -----------------------------
   Tool selector
----------------------------- */

function ToolTabs({ selected, onSelect }: { selected: Tool; onSelect: (t: Tool) => void }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition",
            selected === t.id ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-muted"
          )}
        >
          {t.label}
          {t.heavy ? <span className="ml-2 opacity-80">(heavy)</span> : null}
        </button>
      ))}
    </div>
  );
}

/* -----------------------------
   Small UI pieces
----------------------------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-2xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function MiniRow({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <BadgeCheck className="h-4 w-4" />
      <span className="text-muted-foreground">{title}</span>
    </div>
  );
}

function StationaryAdSlot({
  id,
  title,
  subtitle,
  tall,
  slotLocation = "footer",
}: {
  id: string;
  title: string;
  subtitle: string;
  tall?: boolean;
  slotLocation?: "sidebar" | "footer";
}) {

  return (
    <div className={cn("rounded-3xl border p-4", tall ? "min-h-[220px]" : "min-h-[110px]")}>
      <AdImpressionPing
        event={slotLocation === "sidebar" ? "ad_impression_sidebar" : "ad_impression_footer"}
        slot={`${slotLocation}:${id}`}
      />

      <div className="flex items-center justify-between">
        <Badge variant="outline" className="rounded-full">
          Ad
        </Badge>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">Static placement (no animation). Replace with your ad network later.</p>
      </div>
    </div>
  );
}


function SideRailAds({ showUpsell }: { showUpsell?: boolean }) {
  return (
    <div className="sticky top-24 space-y-4">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-base">Why ads?</CardTitle>
          <CardDescription>They keep AcePrep free.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We only show short ads on heavy tools so everyone can study without paywalls.
        </CardContent>
      </Card>
<StationaryAdSlot id="sidebar_1" title="Ad" subtitle="Sponsored" slotLocation="sidebar" />
<StationaryAdSlot id="sidebar_2" title="Ad" subtitle="Sponsored" slotLocation="sidebar" />
      {showUpsell ? (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Prefer ad-free?</CardTitle>
            <CardDescription>Upgrade anytime.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full rounded-2xl" asChild>
              <Link href="#pricing">Compare plans</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SkeletonOutput() {
  return (
    <Card className="rounded-3xl">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating your study material…
        </div>
        <div className="mt-4 space-y-3">
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-4 w-5/6 rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-24 w-full rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="rounded-3xl border-destructive/40">
      <CardContent className="p-6">
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex gap-2">
          {onRetry ? (
            <Button className="rounded-2xl" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
          <Button className="rounded-2xl" variant="outline" onClick={() => location.reload()}>
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RefusalCard({ reason, selectedTool }: { reason: string | null; selectedTool: Tool }) {
  const suggestions = [
    "I can explain the concept step-by-step.",
    "I can help you build a study guide from your notes.",
    selectedTool === "reviewer" ? "Paste your answer key to verify correctness." : "Share what you’ve tried so far.",
  ];

  return (
    <Card className="rounded-3xl border-foreground/20">
      <CardHeader>
        <CardTitle className="text-base">Request blocked (ethics)</CardTitle>
        <CardDescription>{BRAND_LINE}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Sorry — I can’t help with that request. This tool supports learning and practice, not disallowed content.
        </p>
        {reason ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Reason:</span> {reason}
          </p>
        ) : null}
        <Separator />
        <div className="space-y-2">
          <p className="font-medium">Try this instead:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ExportButtons({ tier, enabled }: { tier: Tier; enabled: boolean }) {
  const locked = tier !== "pro";

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="rounded-2xl" disabled={!enabled || locked}>
        <FileDown className="mr-2 h-4 w-4" />
        PDF
        {locked ? <Lock className="ml-2 h-4 w-4" /> : null}
      </Button>
      <Button variant="outline" className="rounded-2xl" disabled={!enabled || locked}>
        <FileDown className="mr-2 h-4 w-4" />
        Notion
        {locked ? <Lock className="ml-2 h-4 w-4" /> : null}
      </Button>
      <Button variant="outline" className="rounded-2xl" disabled={!enabled || locked}>
        <FileDown className="mr-2 h-4 w-4" />
        Anki (CSV)
        {locked ? <Lock className="ml-2 h-4 w-4" /> : null}
      </Button>
      {locked ? (
        <Badge variant="secondary" className="rounded-full">
          Pro feature
        </Badge>
      ) : null}
    </div>
  );
}

/* -----------------------------
   Output rendering by tool
----------------------------- */

function OutputRenderer({ tool, data }: { tool: Tool; data: any }) {
  switch (tool) {
    case "study_guide":
      return <StudyGuideView data={data} />;
    case "formula_sheet":
      return <FormulaSheetView data={data} />;
    case "reviewer":
      return <ReviewerView data={data} />;
    case "flashcards":
      return <FlashcardsView data={data} />;
    case "planner":
      return <PlannerView data={data} />;
    case "essay_outline":
      return <EssayOutlineView data={data} />;
    case "essay_proofread":
      return <EssayProofreadView data={data} />;
    default:
      return null;
  }
}

function StudyGuideView({ data }: { data: any }) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const whatToStudyFirst = Array.isArray(data?.whatToStudyFirst) ? data.whatToStudyFirst : [];
  const activeRecall = Array.isArray(data?.activeRecall) ? data.activeRecall : [];

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Study Guide</CardTitle>
        <CardDescription>Core concepts, pitfalls, and practice prompts (no answers).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {whatToStudyFirst.length ? (
          <Section title="Study Order">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {whatToStudyFirst.map((s: string, i: number) => (
                <li key={`${s}-${i}`}>{s}</li>
              ))}
            </ol>
          </Section>
        ) : null}

        {sections.map((sec: any, idx: number) => (
          <Card key={idx} className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">{sec?.title ?? `Section ${idx + 1}`}</CardTitle>
              <CardDescription>Focused learning + active recall</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ThreeColList
                aTitle="What to know"
                a={sec?.whatToKnow}
                bTitle="Key concepts"
                b={sec?.keyConcepts}
                cTitle="Common pitfalls"
                c={sec?.misconceptions}
              />

              {Array.isArray(sec?.practiceQuestions) && sec.practiceQuestions.length ? (
                <Section title="Practice Questions (no answers)">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {sec.practiceQuestions.map((q: any, i: number) => (
                      <li key={i} className="rounded-2xl border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-foreground">{q?.question ?? "Question"}</span>
                          {q?.type ? <Badge className="rounded-full">{q.type}</Badge> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </CardContent>
          </Card>
        ))}

        {activeRecall.length ? (
          <Section title="Active Recall Prompts (no answers)">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {activeRecall.map((s: string, i: number) => (
                <li key={`${s}-${i}`}>{s}</li>
              ))}
            </ul>
          </Section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FormulaSheetView({ data }: { data: any }) {
  const topics = Array.isArray(data?.topics) ? data.topics : [];

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Formula Sheet</CardTitle>
        <CardDescription>Grouped by topic, with assumptions and common mistakes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {topics.map((t: any, i: number) => (
          <Card key={i} className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">{t?.topic ?? `Topic ${i + 1}`}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(Array.isArray(t?.formulas) ? t.formulas : []).map((f: any, j: number) => (
                <div key={j} className="rounded-3xl border p-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{f?.name ?? "Formula"}</p>
                      {f?.units ? (
                        <Badge variant="secondary" className="rounded-full">
                          Units: {f.units}
                        </Badge>
                      ) : null}
                    </div>
                    <pre className="mt-2 overflow-x-auto rounded-2xl bg-muted p-3 text-xs">
                      {f?.expression ?? ""}
                    </pre>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <MiniBullets title="Assumptions" items={f?.assumptions} />
                    <MiniBullets title="When to use" items={f?.whenToUse} />
                    <MiniBullets title="Common mistakes" items={f?.commonMistakes} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

function ReviewerView({ data }: { data: any }) {
  const checks = Array.isArray(data?.checks) ? data.checks : [];
  const hints = Array.isArray(data?.hints) ? data.hints : [];
  const nextSteps = Array.isArray(data?.nextSteps) ? data.nextSteps : [];
  const finalAnswerProvided = !!data?.finalAnswerProvided;

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Reviewer</CardTitle>
        <CardDescription>
          Checks + hints + next steps.{" "}
          <span className="font-medium">
            {finalAnswerProvided ? "Final answers may be included (answer key provided)." : "No final answers (no key)."}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Section title="Checks performed">
          {checks.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {checks.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No checks returned.</p>
          )}
        </Section>

        <Section title="Hints">
          {hints.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {hints.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No hints returned.</p>
          )}
        </Section>

        <Section title="Next steps">
          {nextSteps.length ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {nextSteps.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No next steps returned.</p>
          )}
        </Section>
      </CardContent>
    </Card>
  );
}

function FlashcardsView({ data }: { data: any }) {
  const cards = Array.isArray(data?.cards) ? data.cards : [];

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Flashcards</CardTitle>
        <CardDescription>Front/back cards for quick review.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cards.map((c: any, i: number) => (
          <div key={i} className="rounded-3xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="secondary" className="rounded-full">
                Card {i + 1}
              </Badge>
              {c?.difficulty ? <Badge className="rounded-full">{c.difficulty}</Badge> : null}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded-2xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">Front</p>
                <p className="mt-1 text-sm">{c?.front ?? ""}</p>
              </div>
              <div className="rounded-2xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">Back</p>
                <p className="mt-1 text-sm">{c?.back ?? ""}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PlannerView({ data }: { data: any }) {
  const weekPlan = Array.isArray(data?.weekPlan) ? data.weekPlan : [];
  const tips = Array.isArray(data?.tips) ? data.tips : [];

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Study Week Planner</CardTitle>
        <CardDescription>A week plan based on your materials and exam date.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {weekPlan.map((d: any, i: number) => (
            <div key={i} className="rounded-3xl border p-4">
              <p className="text-sm font-semibold">{d?.day ?? `Day ${i + 1}`}</p>
              <div className="mt-2 space-y-2">
                {(Array.isArray(d?.blocks) ? d.blocks : []).map((b: any, j: number) => (
                  <div key={j} className="rounded-2xl bg-muted p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{b?.label ?? "Block"}</span>
                      <span className="text-xs text-muted-foreground">
                        {b?.start ?? ""}–{b?.end ?? ""}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{b?.task ?? ""}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {tips.length ? (
          <Section title="Tips">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {tips.map((t: string, i: number) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </Section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EssayOutlineView({ data }: { data: any }) {
  const thesisOptions = Array.isArray(data?.thesisOptions) ? data.thesisOptions : [];
  const outline = Array.isArray(data?.outline) ? data.outline : [];
  const counterarguments = Array.isArray(data?.counterarguments) ? data.counterarguments : [];
  const evidenceIdeas = Array.isArray(data?.evidenceIdeas) ? data.evidenceIdeas : [];

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Essay Outline</CardTitle>
        <CardDescription>Thesis options + structured outline.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {thesisOptions.length ? (
          <Section title="Thesis options">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {thesisOptions.map((t: string, i: number) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        {outline.length ? (
          <Section title="Outline">
            <div className="space-y-3">
              {outline.map((s: any, i: number) => (
                <div key={i} className="rounded-3xl border p-4">
                  <p className="text-sm font-semibold">{s?.section ?? `Section ${i + 1}`}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {(Array.isArray(s?.bullets) ? s.bullets : []).map((b: string, j: number) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {counterarguments.length ? <MiniBullets title="Counterarguments" items={counterarguments} /> : null}
        {evidenceIdeas.length ? <MiniBullets title="Evidence ideas" items={evidenceIdeas} /> : null}
      </CardContent>
    </Card>
  );
}

function EssayProofreadView({ data }: { data: any }) {
  const summary = typeof data?.summary === "string" ? data.summary : "";
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const revisedExcerpt = typeof data?.revisedExcerpt === "string" ? data.revisedExcerpt : "";
  const nextSteps = Array.isArray(data?.nextSteps) ? data.nextSteps : [];

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Essay Proofread</CardTitle>
        <CardDescription>Clarity + structure + grammar notes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {summary ? (
          <Section title="Summary">
            <p className="text-sm text-muted-foreground">{summary}</p>
          </Section>
        ) : null}

        {issues.length ? (
          <Section title="Issues">
            <div className="space-y-2">
              {issues.map((it: any, i: number) => (
                <div key={i} className="rounded-3xl border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className="rounded-full">{it?.type ?? "other"}</Badge>
                      <Badge variant="secondary" className="rounded-full">
                        severity: {it?.severity ?? "low"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-muted-foreground">{it?.note ?? ""}</p>
                  {it?.suggestion ? (
                    <p className="mt-2">
                      <span className="font-medium">Suggestion:</span> {it.suggestion}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {revisedExcerpt ? (
          <Section title="Revised excerpt (sample)">
            <pre className="overflow-x-auto rounded-2xl bg-muted p-3 text-xs">{revisedExcerpt}</pre>
          </Section>
        ) : null}

        {nextSteps.length ? (
          <Section title="Next steps">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {nextSteps.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </Section>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* -----------------------------
   Generic output helpers
----------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

function MiniBullets({ title, items }: { title: string; items: any }) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return null;
  return (
    <div className="rounded-3xl border p-4">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {arr.map((s: string, i: number) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function ThreeColList({
  aTitle,
  a,
  bTitle,
  b,
  cTitle,
  c,
}: {
  aTitle: string;
  a: any;
  bTitle: string;
  b: any;
  cTitle: string;
  c: any;
}) {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  const C = Array.isArray(c) ? c : [];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <MiniBullets title={aTitle} items={A} />
      <MiniBullets title={bTitle} items={B} />
      <MiniBullets title={cTitle} items={C} />
    </div>
  );
}

/* -----------------------------
   Ad overlay (15s, unskippable)
----------------------------- */

function AdOverlay({ remaining, showAlmostDone }: { remaining: number; showAlmostDone: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-background p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="rounded-full">
            Ad
          </Badge>
          <Badge className="rounded-full">
            {remaining > 0 ? `${remaining}s` : "0s"}
          </Badge>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-lg font-semibold">This keeps AcePrep free.</p>
          <p className="text-sm text-muted-foreground">
            Your content is generating in the background. This ad is unskippable.
          </p>
        </div>

        <div className="mt-5 rounded-3xl border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {remaining > 0 ? "Generating…" : showAlmostDone ? "Almost done…" : "Finishing up…"}
          </div>
          <div className="mt-3 h-2 w-full rounded bg-muted">
            <div
              className="h-2 rounded bg-foreground transition-all"
              style={{ width: `${Math.min(100, ((AD_SECONDS - remaining) / AD_SECONDS) * 100)}%` }}
            />
          </div>
        </div>

        <div className="mt-4 text-xs text-muted-foreground">{BRAND_LINE}</div>
      </div>
    </div>
  );
}

/* -----------------------------
   Pricing + Footer
----------------------------- */

function PricingCard({
  title,
  price,
  subtitle,
  bullets,
  ctaLabel,
  ctaHref,
  variant,
  highlight,
  onCtaClick,
}: {
  title: string;
  price: string;
  subtitle: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
  variant: "default" | "outline";
  highlight?: boolean;
  onCtaClick?: () => void;
}) {

  return (
    <Card className={cn("rounded-3xl", highlight ? "border-foreground/30 shadow-sm" : "")}>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {title === "Pro" ? <Badge className="rounded-full">Recommended</Badge> : null}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight">{price}</span>
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
        asChild
        className="w-full rounded-2xl"
        variant={variant === "default" ? "default" : "outline"}
        onClick={onCtaClick}
      >
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <BadgeCheck className="mt-0.5 h-4 w-4" />
              {b}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Footer() {
  return (
    <footer className="mt-10">
      <Card className="rounded-3xl">
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold">AcePrep</p>
            <p className="text-xs text-muted-foreground">{BRAND_LINE}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/terms" className="text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link href="/support" className="text-muted-foreground hover:text-foreground">
              Support
            </Link>
          </div>
        </CardContent>
      </Card>
      <p className="py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} AcePrep. All rights reserved.
      </p>
    </footer>
  );
}

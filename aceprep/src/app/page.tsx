"use client";

import { useMemo, useState } from "react";

type ToolName =
  | "Study Guide"
  | "Exam Pack"
  | "Formula Sheet"
  | "Homework Explain"
  | "Essay Outline";

export default function Home() {
  const [tool, setTool] = useState<ToolName>("Study Guide");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adSecondsLeft, setAdSecondsLeft] = useState<number>(5);

  const [notes, setNotes] = useState("");
  const [examType, setExamType] = useState("");
  const [profEmphasis, setProfEmphasis] = useState("");

  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>("Generated content will appear here.");
  const [error, setError] = useState<string | null>(null);

  const toolDescription = useMemo(() => {
    switch (tool) {
      case "Study Guide":
        return "Turn notes into a clean, exam-ready study guide.";
      case "Exam Pack":
        return "Generate practice questions + answers from your materials.";
      case "Formula Sheet":
        return "Extract formulas, definitions, and key relationships.";
      case "Homework Explain":
        return "Explain concepts step-by-step (without doing dishonest submission).";
      case "Essay Outline":
        return "Create a thesis + outline + key points from prompts or readings.";
      default:
        return "Generate something you’d actually study.";
    }
  }, [tool]);

  function onGenerateClick() {
    setError(null);
    setIsModalOpen(true);
  }

  function startMockAd() {
    setIsWatchingAd(true);
    setAdSecondsLeft(5);

    const start = Date.now();
    const durationMs = 5000;

    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      setAdSecondsLeft(remaining);

      if (elapsed >= durationMs) {
        clearInterval(timer);
        setIsWatchingAd(false);
        setIsModalOpen(false);
        void runGeneration();
      }
    }, 250);
  }

  async function runGeneration() {
    try {
      setLoading(true);
      setError(null);
      setOutput("Generating…");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool,
          notes,
          options: {
            examType,
            profEmphasis,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Generation failed.");
      }

      setOutput(data.output ?? "No output returned.");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
      setOutput("Generated content will appear here.");
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-black">
      {/* TOP NAV */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-xl font-semibold">AcePrep</span>

          <select
            value={tool}
            onChange={(e) => setTool(e.target.value as ToolName)}
            className="rounded-md border px-3 py-1 text-sm"
          >
            <option>Study Guide</option>
            <option>Exam Pack</option>
            <option>Formula Sheet</option>
            <option>Homework Explain</option>
            <option>Essay Outline</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button className="rounded-md border px-4 py-1.5 text-sm">Login / Sign Up</button>
          <button className="rounded-md border px-3 py-1.5 text-sm">☰</button>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="mx-auto grid max-w-7xl grid-cols-12 gap-4 px-4 py-6">
        {/* LEFT ADS */}
        <aside className="col-span-12 hidden md:col-span-3 md:block">
          <div className="sticky top-24 rounded-xl border bg-white p-4">
            <p className="mb-2 text-sm font-medium text-zinc-600">Sponsored</p>
            <div className="h-64 rounded-lg border bg-zinc-50" />
          </div>
        </aside>

        {/* CENTER TOOL */}
        <main className="col-span-12 md:col-span-6">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h1 className="mb-1 text-xl font-semibold">{tool}</h1>
            <p className="mb-4 text-sm text-zinc-600">{toolDescription}</p>

            {/* INPUT TEXT (fast MVP) */}
            <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
              <label className="mb-2 block text-sm font-medium">Paste notes / prompt</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste lecture notes, slides text, or a prompt here…"
                className="h-32 w-full resize-none rounded-md border bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">
                File upload is next — for now paste text to test the full flow.
              </p>
            </div>

            {/* OPTIONS */}
            <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
              <label className="mb-2 block text-sm font-medium">Options</label>
              <input
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                placeholder="Exam type (MC, FR, mixed)"
                className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                value={profEmphasis}
                onChange={(e) => setProfEmphasis(e.target.value)}
                placeholder="Professor emphasis (conceptual, calculation-heavy)"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            {/* GENERATE */}
            <button
              onClick={onGenerateClick}
              disabled={loading}
              className="mb-3 w-full rounded-lg bg-black py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {loading ? "Generating…" : "Generate ▶"}
            </button>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* OUTPUT */}
            <div className="rounded-lg border bg-zinc-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Output</span>
                <div className="flex gap-2">
                  <button onClick={copyOutput} className="rounded-md border px-2 py-1 text-xs">
                    Copy
                  </button>
                  <button className="rounded-md border px-2 py-1 text-xs" disabled>
                    Export (soon)
                  </button>
                </div>
              </div>
              <pre className="h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-white p-3 text-sm text-zinc-800">
                {output}
              </pre>
            </div>
          </div>
        </main>

        {/* RIGHT ADS */}
        <aside className="col-span-12 hidden md:col-span-3 md:block">
          <div className="sticky top-24 rounded-xl border bg-white p-4">
            <p className="mb-2 text-sm font-medium text-zinc-600">Ads</p>
            <div className="h-64 rounded-lg border bg-zinc-50" />
          </div>
        </aside>
      </div>

      {/* AD GATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-2 text-lg font-semibold">Watch a short ad to generate</div>
            <div className="mb-4 text-sm text-zinc-600">
              Free users watch a quick ad. Pro users generate instantly (we’ll add that later).
            </div>

            <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
              <div className="text-sm font-medium text-zinc-700">Mock Ad</div>
              <div className="mt-2 h-24 rounded-md border bg-white" />
              {isWatchingAd && (
                <div className="mt-2 text-sm text-zinc-600">
                  Ad ends in <span className="font-semibold">{adSecondsLeft}</span>s…
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isWatchingAd}
                className="flex-1 rounded-lg border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={startMockAd}
                disabled={isWatchingAd}
                className="flex-1 rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {isWatchingAd ? "Watching…" : "Watch Ad (5s)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

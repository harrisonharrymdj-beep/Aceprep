"use client";

import { useMemo, useState } from "react";

const adDurationMs = 15000; // 15s ad
const DAILY_FREE_LIMIT = 5;

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
  const [output, setOutput] = useState("Generated content will appear here.");
  const [error, setError] = useState<string | null>(null);

  const toolDescription = useMemo(() => {
    switch (tool) {
      case "Study Guide":
        return "Turn notes into a clean, exam-ready study guide.";
      case "Formula Sheet":
        return "Extract formulas, definitions, and key relationships.";
      case "Homework Explain":
        return "Explain concepts step-by-step.";
      case "Essay Outline":
        return "Create a thesis + outline + key points.";
      case "Exam Pack":
        return "Generate practice questions (Pro only).";
      default:
        return "";
    }
  }, [tool]);

  function onGenerateClick() {
    setError(null);
    setIsModalOpen(true);
  }

  function checkDailyLimit() {
    const today = new Date().toDateString();
    const key = `aceprep_free_${today}`;
    const used = Number(localStorage.getItem(key) ?? 0);

    if (used >= DAILY_FREE_LIMIT) {
      setError("Daily free limit reached (5/day). Try again tomorrow or go Pro.");
      return false;
    }

    localStorage.setItem(key, String(used + 1));
    return true;
  }

  function startMockAd() {
    if (isWatchingAd) return;
    if (!notes.trim()) {
      setError("Paste notes or upload a PDF first.");
      return;
    }
    if (!checkDailyLimit()) return;

    setIsWatchingAd(true);
    setAdSecondsLeft(Math.ceil(adDurationMs / 1000));

    runGeneration(); // background

    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      setAdSecondsLeft(Math.max(0, Math.ceil((adDurationMs - elapsed) / 1000)));

      if (elapsed >= adDurationMs) {
        clearInterval(timer);
        setIsWatchingAd(false);
        setIsModalOpen(false);
      }
    }, 250);
  }

  async function runGeneration() {
    try {
      setLoading(true);
      setOutput("Generating…");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool,
          notes,
          options: { examType, profEmphasis },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Generation failed.");

      setOutput(data.output ?? "No output returned.");
    } catch (e: any) {
      setError(e.message);
      setOutput("Generated content will appear here.");
    } finally {
      setLoading(false);
    }
  }

  
async function handlePdfUpload(file: File) {
  setError(null);
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // ✅ PDF.js requires workerSrc to be defined even if worker is disabled
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";


    const buffer = await file.arrayBuffer();

    const pdf = await (pdfjsLib as any).getDocument({
      data: buffer,
    }).promise;

    let text = "";
    const maxPages = Math.min(pdf.numPages, 10);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += (content.items as any[]).map((it) => it.str).join(" ") + "\n";
    }

    setNotes((prev) => (prev ? prev + "\n\n" : "") + text.slice(0, 30000));
  } catch (e: any) {
    console.error(e);
    setError(`PDF read failed: ${e?.message ?? String(e)}`);
  }
}






  return (
    <div className="min-h-screen bg-zinc-100 text-black">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <span className="text-xl font-semibold">AcePrep</span>
        <div className="flex gap-3">
          <button className="rounded-md border px-4 py-1.5 text-sm">Login / Sign Up</button>
          <button className="rounded-md border px-3 py-1.5 text-sm">☰</button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* DOCUMENT TYPE */}
        <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
          <label className="mb-2 block text-sm font-medium">Document type</label>
          <div className="grid grid-cols-2 gap-2">
            {["Study Guide", "Formula Sheet", "Homework Explain", "Essay Outline"].map((t) => (
              <button
                key={t}
                onClick={() => setTool(t as ToolName)}
                className={`rounded-md border px-3 py-2 text-sm ${
                  tool === t ? "bg-black text-white" : "bg-white"
                }`}
              >
                {t}
              </button>
            ))}
            <button
              disabled
              className="rounded-md border px-3 py-2 text-sm bg-white opacity-50 cursor-not-allowed"
            >
              Exam Pack 🔒
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Exam Pack is Pro-only.</p>
        </div>

        {/* NOTES + PDF */}
        <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
          <label className="mb-2 block text-sm font-medium">Paste notes or upload PDF</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-32 w-full resize-none rounded-md border px-3 py-2 text-sm"
          />
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdfUpload(f);
              e.currentTarget.value = "";
            }}
            className="mt-2 text-sm"
          />
        </div>

        <button
          onClick={onGenerateClick}
          className="w-full rounded-lg bg-black py-3 text-sm font-medium text-white"
        >
          Generate ▶
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <pre className="mt-4 h-64 overflow-auto rounded-md border bg-white p-3 text-sm">
          {output}
        </pre>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-5 rounded-xl w-full max-w-md">
            <p className="font-semibold mb-2">Watch a short ad</p>
            <div className="h-24 border mb-2" />
            {isWatchingAd && <p>Ad ends in {adSecondsLeft}s…</p>}
            <button
              onClick={startMockAd}
              disabled={isWatchingAd}
              className="mt-3 w-full bg-black text-white py-2 rounded-lg"
            >
              Watch Ad (15s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

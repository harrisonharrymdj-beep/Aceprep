"use client";

import { useMemo, useState } from "react";
import { safePostJSON } from "@/lib/api";


const adDurationMs = 15000; // 15s ad
const DAILY_FREE_LIMIT = 5; // <-- change here

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
  const [adSecondsLeft, setAdSecondsLeft] = useState<number>(
    Math.ceil(adDurationMs / 1000)
  );

  const [notes, setNotes] = useState("");
  const [examType, setExamType] = useState("");
  const [profEmphasis, setProfEmphasis] = useState("");

  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("Generated content will appear here.");
  const [error, setError] = useState<string | null>(null);

  // ✅ PDF UI + hidden extracted text (still client-side for now)
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfText, setPdfText] = useState<string>("");

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
      setError(
        `Daily free limit reached (${DAILY_FREE_LIMIT}/day). Try again tomorrow or go Pro.`
      );
      return false;
    }
    localStorage.setItem(key, String(used + 1));
    return true;
  }

  function startMockAd() {
    if (isWatchingAd) return;

    const hasMaterial = notes.trim().length > 0 || pdfText.trim().length > 0;
    if (!hasMaterial) {
      setError("Paste notes or upload a PDF first.");
      return;
    }
    if (!checkDailyLimit()) return;

    setIsWatchingAd(true);
    setAdSecondsLeft(Math.ceil(adDurationMs / 1000));

    // Start AI immediately (in background)
    runGeneration();

    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(
        0,
        Math.ceil((adDurationMs - elapsed) / 1000)
      );
      setAdSecondsLeft(remaining);

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
      setError(null);
      setOutput("Generating…");

      const combinedNotes =
        (notes.trim() ? `USER NOTES:\n${notes.trim()}\n\n` : "") +
        (pdfText.trim()
          ? `PDF TEXT (${pdfFileName ?? "uploaded.pdf"}):\n${pdfText.trim()}`
          : "");

      const data = await safePostJSON("/api/aceprep", {
  tool,
  notes: combinedNotes,
  options: { examType, profEmphasis },
});

setOutput(data.output ?? "No output returned.");

    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
      setOutput("Generated content will appear here.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfUpload(file: File) {
    setError(null);
    setPdfFileName(file.name);

    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      const buffer = await file.arrayBuffer();
      const pdf = await (pdfjsLib as any).getDocument({ data: buffer }).promise;

      let text = "";
      const maxPages = Math.min(pdf.numPages, 10);

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += (content.items as any[]).map((it) => it.str).join(" ") + "\n";
      }

      const clipped = text.slice(0, 30000).trim();
      if (!clipped || clipped.replace(/\s/g, "").length < 200) {
        setError(
          "Couldn’t extract enough readable text from that PDF. Try another PDF or paste the text."
        );
      }
      setPdfText(clipped);
    } catch (e: any) {
      console.error(e);
      setPdfFileName(null);
      setPdfText("");
      setError(`PDF read failed: ${e?.message ?? String(e)}`);
    }
  }

  function removePdf() {
    setPdfFileName(null);
    setPdfText("");
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-black">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <span className="text-xl font-semibold">AcePrep</span>
        <div className="flex gap-3">
          <button className="rounded-md border px-4 py-1.5 text-sm">
            Login / Sign Up
          </button>
          <button className="rounded-md border px-3 py-1.5 text-sm">☰</button>
        </div>
      </header>

      {/* MAIN LAYOUT (with side ads) */}
      <div className="mx-auto grid max-w-7xl grid-cols-12 gap-4 px-4 py-6">
        {/* LEFT ADS */}
        <aside className="col-span-12 hidden md:col-span-3 md:block">
          <div className="sticky top-24 rounded-xl border bg-white p-4">
            <p className="mb-2 text-sm font-medium text-zinc-600">Sponsored</p>
            <div className="h-64 rounded-lg border bg-zinc-50 flex items-center justify-center text-xs text-zinc-500">
              Ad slot (left)
            </div>
            <div className="mt-3 h-64 rounded-lg border bg-zinc-50 flex items-center justify-center text-xs text-zinc-500">
              Ad slot (left 2)
            </div>
          </div>
        </aside>

        {/* CENTER */}
        <main className="col-span-12 md:col-span-6">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            {/* DOCUMENT TYPE */}
            <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
              <label className="mb-2 block text-sm font-medium">Document type</label>

              <div className="grid grid-cols-2 gap-2">
                {["Study Guide", "Formula Sheet", "Homework Explain", "Essay Outline"].map(
                  (t) => (
                    <button
                      key={t}
                      onClick={() => setTool(t as ToolName)}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        tool === t ? "bg-black text-white" : "bg-white"
                      }`}
                    >
                      {t}
                    </button>
                  )
                )}

                <button
                  disabled
                  className="rounded-md border px-3 py-2 text-sm bg-white opacity-50 cursor-not-allowed"
                  title="Pro only"
                >
                  Exam Pack 🔒
                </button>
              </div>

              <p className="mt-2 text-xs text-zinc-500">{toolDescription}</p>
            </div>

            {/* NOTES + PDF */}
            <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
              <label className="mb-2 block text-sm font-medium">
                Paste notes (PDF text is hidden)
              </label>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste notes here…"
                className="h-32 w-full resize-none rounded-md border px-3 py-2 text-sm"
              />

              <div className="mt-3 flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-zinc-50">
                  <span className="text-base font-semibold">＋</span>
                  <span>Add PDF</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePdfUpload(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                {pdfFileName && (
                  <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm">
                    <span className="max-w-[220px] truncate">{pdfFileName}</span>
                    <button
                      type="button"
                      onClick={removePdf}
                      className="rounded-full px-2 py-0.5 text-zinc-600 hover:bg-zinc-100"
                      aria-label="Remove PDF"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {pdfFileName && (
                  <span className="text-xs text-zinc-500">
                    PDF uploaded (text will be included automatically)
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onGenerateClick}
              disabled={loading}
              className="w-full rounded-lg bg-black py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Generating…" : "Generate ▶"}
            </button>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <pre className="mt-4 h-64 overflow-auto rounded-md border bg-white p-3 text-sm">
              {output}
            </pre>
          </div>
        </main>

        {/* RIGHT ADS */}
        <aside className="col-span-12 hidden md:col-span-3 md:block">
          <div className="sticky top-24 rounded-xl border bg-white p-4">
            <p className="mb-2 text-sm font-medium text-zinc-600">Ads</p>
            <div className="h-64 rounded-lg border bg-zinc-50 flex items-center justify-center text-xs text-zinc-500">
              Ad slot (right)
            </div>
            <div className="mt-3 h-64 rounded-lg border bg-zinc-50 flex items-center justify-center text-xs text-zinc-500">
              Ad slot (right 2)
            </div>
          </div>
        </aside>
      </div>

      {/* AD MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white p-5 rounded-xl w-full max-w-md">
            <p className="font-semibold mb-2">Watch a short ad</p>
            <div className="h-24 border mb-2 bg-zinc-50" />
            {isWatchingAd && (
              <p className="text-sm">Ad ends in {adSecondsLeft}s…</p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isWatchingAd}
                className="flex-1 rounded-lg border py-2 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={startMockAd}
                disabled={isWatchingAd}
                className="flex-1 bg-black text-white py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {isWatchingAd
                  ? "Watching…"
                  : `Watch Ad (${Math.ceil(adDurationMs / 1000)}s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

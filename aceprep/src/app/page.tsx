"use client";

import { useState } from "react";

export default function Home() {
  const [tool, setTool] = useState("Study Guide");

  return (
    <div className="min-h-screen bg-zinc-100 text-black">
      {/* TOP NAV */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-xl font-semibold">AcePrep</span>

          {/* TOOL DROPDOWN */}
          <select
            value={tool}
            onChange={(e) => setTool(e.target.value)}
            className="rounded-md border px-3 py-1 text-sm"
          >
            <option>Study Guide</option>
            <option>Exam Pack</option>
            <option>Formula Sheet</option>
            <option>Homework Explain</option>
            <option>Essay Outline</option>
          </select>
        </div>

        {/* RIGHT NAV */}
        <div className="flex items-center gap-3">
          <button className="rounded-md border px-4 py-1.5 text-sm">
            Login / Sign Up
          </button>
          <button className="rounded-md border px-3 py-1.5 text-sm">
            ☰
          </button>
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
            <p className="mb-4 text-sm text-zinc-600">
              Upload your class materials and generate something you’d actually
              study.
            </p>

            {/* UPLOAD */}
            <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
              <label className="mb-2 block text-sm font-medium">
                Upload files
              </label>
              <input
                type="file"
                multiple
                className="w-full text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">
                PDFs, DOCX, TXT supported
              </p>
            </div>

            {/* OPTIONS */}
            <div className="mb-4 rounded-lg border bg-zinc-50 p-4">
              <label className="mb-2 block text-sm font-medium">
                Options
              </label>
              <input
                placeholder="Exam type (MC, FR, mixed)"
                className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                placeholder="Professor emphasis (conceptual, calculation-heavy)"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            {/* GENERATE */}
            <button className="mb-4 w-full rounded-lg bg-black py-3 text-sm font-medium text-white hover:bg-zinc-800">
              Generate ▶
            </button>

            {/* OUTPUT */}
            <div className="rounded-lg border bg-zinc-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Output</span>
                <div className="flex gap-2">
                  <button className="rounded-md border px-2 py-1 text-xs">
                    Copy
                  </button>
                  <button className="rounded-md border px-2 py-1 text-xs">
                    Export
                  </button>
                </div>
              </div>
              <div className="h-48 rounded-md border bg-white p-3 text-sm text-zinc-500">
                Generated content will appear here.
              </div>
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
    </div>
  );
}

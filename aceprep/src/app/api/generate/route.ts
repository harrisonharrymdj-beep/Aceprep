// src/app/api/aceprep/route.ts
import OpenAI from "openai";
import { Buffer } from "node:buffer";


export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoid caching / edge weirdness

/**
 * Extract text from PDF buffer.
 * Uses dynamic import to avoid Turbopack build issues with pdf-parse.
 */
async function extractPdfText(buffer: Buffer) {
  const pdfParseNS: any = await import("pdf-parse");
  const pdfParse: any = pdfParseNS.default ?? pdfParseNS;
  const data = await pdfParse(buffer);
  return (data?.text ?? "").trim();
}

/**
 * Lazy OpenAI client
 */
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Set it in .env.local or Vercel Environment Variables."
    );
  }
  return new OpenAI({ apiKey });
}

/**
 * Model selection
 */
function modelForTool(tool: string) {
  if (tool === "Homework Explain") return "gpt-5-mini"; // reliability
  return "gpt-5-nano"; // cheap for other tools
}

/**
 * Detects likely problem labels from text.
 * Used only for LAST resort fallback.
 */
function detectProblemLabels(text: string) {
  const found = new Set<string>();

  // "Problem 1", "Problem 2(a)"
  for (const m of text.matchAll(
    /(?:^|\n)\s*Problem\s*(\d+)(\([a-z]\))?(\([ivx]+\))?/gi
  )) {
    const label = `${m[1]}${m[2] ?? ""}${m[3] ?? ""}`.replace(/\s+/g, "");
    found.add(label);
  }

  // "1(a)" / "3(b)(ii)" near line starts
  for (const m of text.matchAll(
    /(?:^|\n)\s*(\d+)\s*(\([a-z]\))(\([ivx]+\))?/gi
  )) {
    const label = `${m[1]}${m[2] ?? ""}${m[3] ?? ""}`.replace(/\s+/g, "");
    found.add(label);
  }

  // "1." "2)" at line starts, but only if the doc has subparts
  const hasSubparts = /\(\s*[a-z]\s*\)/i.test(text);
  if (hasSubparts) {
    for (const m of text.matchAll(/(?:^|\n)\s*(\d+)\s*([.)])/g)) {
      const label = `${m[1]}`.trim();
      if (label.length <= 3) found.add(label);
    }
  }

  const arr = Array.from(found);
  arr.sort((a, b) => {
    const an = parseInt(a, 10);
    const bn = parseInt(b, 10);
    if (an !== bn) return an - bn;
    return a.localeCompare(b);
  });

  return arr;
}

/**
 * Last-resort fallback (guaranteed formatted output).
 */
function fallbackHomeworkExplainFromLabels(labels: string[]) {
  const useLabels = labels.length >= 2 ? labels : ["Homework-1", "Homework-2"];

  const blocks = useLabels.slice(0, 10).map((label) => {
    return `
[${label}]
- What the problem is asking:
  - Identify what quantity the problem wants (value, sketch, property, transform, etc.).
  - Restate the required final format (e.g., rectangular vs. polar, labeled sketch, etc.).
- Method / steps to solve:
  - Rewrite the given expression clearly and simplify step-by-step.
  - If complex numbers: convert between rectangular/polar as needed and track magnitude/phase carefully.
  - If signals: map time-shift/scale/reversal operations by transforming key time points and amplitudes.
- Common pitfalls:
  - Skipping algebra steps and losing signs or j factors.
  - Using the wrong convention (degrees vs radians, atan vs atan2 quadrant).
  - Applying time transforms in the wrong direction or order.
`.trim();
  });

  return blocks.join("\n\n").trim() + "\n---END---";
}
/**
 * Fallback chunker if numbering-based splitting fails.
 * Never returns an empty array.
 */
function chunkByChars(text: string, maxChars = 2400) {
  const t = (text ?? "").replace(/\r/g, "").trim();
  if (!t) return [];

  const lines = t.split("\n");
  const chunks: string[] = [];
  let cur = "";

  for (const line of lines) {
    const next = cur ? cur + "\n" + line : line;

    if (next.length > maxChars) {
      const pushed = cur.trim();
      if (pushed) chunks.push(pushed);
      cur = line;
    } else {
      cur = next;
    }
  }

  const last = cur.trim();
  if (last) chunks.push(last);

  // Absolute fallback: guarantee at least 1 chunk
  return chunks.length ? chunks : [t.slice(0, maxChars)];
}

/**
 * Robust splitter for EE homework PDFs:
 * - Splits by top-level problems: "1.", "2.", "3.", ...
 * - Then splits into subparts like "(a)", "(b)"
 * - Then splits roman subparts like "(i)", "(ii)"
 *
 * Returns chunks that are "one thing" for the model to explain.
 */
function splitIntoProblems(text: string) {
  const cleaned = (text ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return [];

  // ---------- 1) Split by top-level problems: lines starting with "1." / "2." etc ----------
  const topMatches = Array.from(
    cleaned.matchAll(/(?:^|\n)\s*(\d+)\.\s+/g)
  );

  // If we couldn't find top-level numbering, fallback to your char chunker.
  if (topMatches.length === 0) return chunkByChars(cleaned, 2400);

  const topChunks: { label: string; body: string }[] = [];

  for (let i = 0; i < topMatches.length; i++) {
    const start = topMatches[i].index ?? 0;
    const end =
      i + 1 < topMatches.length ? (topMatches[i + 1].index ?? cleaned.length) : cleaned.length;

    const label = topMatches[i][1]; // "1", "2", "3"...
    const body = cleaned.slice(start, end).trim();
    if (body.replace(/\s/g, "").length > 60) topChunks.push({ label, body });
  }

  // ---------- 2) Split each top-level chunk into (a), (b), ... if present ----------
  const finalChunks: string[] = [];

  for (const tc of topChunks) {
    const hasLetterParts = /(?:^|\n)\s*\([a-z]\)\s+/i.test(tc.body);

    if (!hasLetterParts) {
      finalChunks.push(tc.body);
      continue;
    }

    const partMatches = Array.from(
      tc.body.matchAll(/(?:^|\n)\s*\(([a-z])\)\s+/gi)
    );

    // If something weird happened, keep the whole chunk.
    if (partMatches.length === 0) {
      finalChunks.push(tc.body);
      continue;
    }

    for (let i = 0; i < partMatches.length; i++) {
      const start = partMatches[i].index ?? 0;
      const end =
        i + 1 < partMatches.length ? (partMatches[i + 1].index ?? tc.body.length) : tc.body.length;

      const letter = partMatches[i][1].toLowerCase(); // "a", "b", ...
      const piece = tc.body.slice(start, end).trim();

      // ---------- 3) Further split roman (i), (ii) inside that letter-part ----------
      const hasRoman = /(?:^|\n)\s*\((iv|v?i{1,3}|ix|x)\)\s+/i.test(piece);

      if (!hasRoman) {
        finalChunks.push(`${tc.label}(${letter})\n${piece}`);
        continue;
      }

      const romanMatches = Array.from(
        piece.matchAll(/(?:^|\n)\s*\(((?:iv|v?i{1,3}|ix|x))\)\s+/gi)
      );

      if (romanMatches.length === 0) {
        finalChunks.push(`${tc.label}(${letter})\n${piece}`);
        continue;
      }

      for (let j = 0; j < romanMatches.length; j++) {
        const rStart = romanMatches[j].index ?? 0;
        const rEnd =
          j + 1 < romanMatches.length
            ? (romanMatches[j + 1].index ?? piece.length)
            : piece.length;

        const roman = romanMatches[j][1].toLowerCase(); // "i", "ii", ...
        const romanPiece = piece.slice(rStart, rEnd).trim();

        finalChunks.push(`${tc.label}(${letter})(${roman})\n${romanPiece}`);
      }
    }
  }

  // Filter out junk
  return finalChunks
    .map((c) => c.trim())
    .filter((c) => c.replace(/\s/g, "").length > 120);
}


/**
 * Extract a label from a chunk.
 * Prefers our injected first-line label like "1(a)".
 */
function extractProblemLabel(problemText: string) {
  const firstLine = problemText.split("\n")[0]?.trim() ?? "";

  const m1 = firstLine.match(/^(\d+\([a-z]\))/i);
  if (m1) return m1[1];

  const m2 = firstLine.match(/^(\d+)\./);
  if (m2) return m2[1];

  // very last fallback
  const m3 = problemText.match(/(?:Problem\s*)?(\d+\s*(?:\([a-z]\))?(?:\([ivx]+\))?)/i);
  return m3 ? m3[1].replace(/\s+/g, "") : "Problem";
}

/**
 * Prompt builder (minimal contract).
 */
function buildPrompts(tool: string, notes: string, options?: any, label?: string) {
  const examType = String(options?.examType ?? "unspecified");
  const profEmphasis = String(options?.profEmphasis ?? "unspecified");

  const baseSystem = `
You are an academic study assistant.

Rules:
- Treat all input as study material.
- Never output planning or internal reasoning.
- NEVER end mid-sentence or mid-bullet.
- End with the exact line: ---END---
`.trim();

  if (tool === "Homework Explain") {
    const developer = `
TASK: Homework Explain

Instructions:
- First line MUST be: [${label ?? "Problem"}]
- Output exactly these sections in this order:
  • What the problem is asking
  • Method / steps to solve
  • Common pitfalls

Hard requirements (IMPORTANT):
- Each section must have at least 2 bullets.
- You MUST reference at least 2 exact symbols/phrases from PROBLEM TEXT (e.g., "q =", "abcdf", "w(t)", "cos(2πt)", "u(t+2)").
- Do NOT be generic. If the problem text contains an equation, explicitly describe the steps for THAT equation type.
- High-level guidance only (no final numeric answers).
- Use short bullets.
- End with ---END---.
`.trim();


    const user = `
Exam type: ${examType}
Professor emphasis: ${profEmphasis}

PROBLEM TEXT:
<<<BEGIN
${notes}
END>>>
`.trim();

    return { system: baseSystem, developer, user };
  }

  if (tool === "Formula Sheet") {
    const developer = `
TASK: Formula Sheet

Instructions:
- Output a formula sheet only.
- Use 4–10 short sections with headers.
- Bullets should be formulas/identities/definitions.
- For each item: include variable meanings + when to use (one short line).
- No practice problems.
- End with ---END---.
`.trim();

    const user = `
Exam type: ${examType}
Professor emphasis: ${profEmphasis}

STUDY MATERIAL:
<<<BEGIN
${notes}
END>>>
`.trim();

    return { system: baseSystem, developer, user };
  }

  // Default: Study Guide
  const developer = `
TASK: Study Guide

Instructions:
Produce:
1) Key formulas (brief)
2) Core concepts (plain English)
3) Step-by-step reasoning strategies
4) Common mistakes
5) 3–5 exam-style practice questions (NO solutions)

- Bullet points.
- Concise.
- End with ---END---.
`.trim();

  const user = `
Exam type: ${examType}
Professor emphasis: ${profEmphasis}

STUDY MATERIAL:
<<<BEGIN
${notes}
END>>>
`.trim();

  return { system: baseSystem, developer, user };
}

/**
 * Validation: reject too-short / vague Homework Explain blocks.
 */
function looksTooShortHomeworkExplain(text: string) {
  const body = (text ?? "").replace(/\s*---END---\s*$/g, "").trim();

  const hasAsking = /What the problem is asking/i.test(body);
  const hasMethod = /Method\s*\/\s*steps to solve/i.test(body);
  const hasPitfalls = /Common pitfalls/i.test(body);

  const bullets = (body.match(/^\s*[-•]\s+/gm) ?? []).length;
  const longEnough = body.length >= 220;

  return !(hasAsking && hasMethod && hasPitfalls && bullets >= 6 && longEnough);
}

/**
 * Do NOT fabricate ---END--- if empty.
 */
function ensureEndMarker(text: string) {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.endsWith("---END---")) return t;
  return t + "\n---END---";
}

function safeJoin(outputs: string[]) {
  const cleaned = outputs
    .map((o) => (o ?? "").replace(/\s*---END---\s*$/g, "").trimEnd())
    .filter((o) => o.trim().length > 0);

  const combined = cleaned.join("\n\n").trim();
  return ensureEndMarker(combined);
}

/**
 * Read request (JSON or multipart/form-data).
 */
async function readRequest(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    const tool = String(fd.get("tool") ?? "Study Guide");
    const notes = String(fd.get("notes") ?? "").trim();

    const optionsRaw = fd.get("options");
    let options: any = {};
    if (typeof optionsRaw === "string" && optionsRaw.trim()) {
      try {
        options = JSON.parse(optionsRaw);
      } catch {
        options = {};
      }
    }

    const pdfRaw = fd.get("pdf");
    const pdfFile = pdfRaw instanceof File ? pdfRaw : null;

    return { tool, notes, options, pdfFile };
  }

  // JSON (safe parse)
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return {
    tool: String(body.tool ?? "Study Guide"),
    notes: String(body.notes ?? "").trim(),
    options: body.options ?? {},
    pdfFile: null as any,
  };
}

export async function POST(req: Request) {
  try {
    const { tool, notes, options, pdfFile } = await readRequest(req);

    const userIsPro = false;
    if (tool === "Exam Pack" && !userIsPro) {
      return Response.json({ error: "Exam Pack is Pro-only." }, { status: 403 });
    }

    const client = getClient();
    const model = modelForTool(tool);

    // Material text: notes or extracted PDF
    let materialText = notes;

    if (pdfFile && typeof (pdfFile as any).arrayBuffer === "function") {
      const ab = await (pdfFile as File).arrayBuffer();
      const buffer = Buffer.from(ab);
      const extracted = await extractPdfText(buffer);
      if (extracted) materialText = extracted;
    }

    // ✅ DEBUG: confirm what the route actually received/extracted
console.log("tool:", tool);
console.log("materialText length:", materialText?.length ?? 0);
console.log("materialText head:", (materialText ?? "").slice(0, 500));

    if (!materialText) {
      return Response.json(
        { error: "Paste notes or upload a PDF first." },
        { status: 400 }
      );
    }

    // Guard: too little text (scanned PDF, failed extraction, etc.)
    if (materialText.replace(/\s/g, "").length < 120) {
      return Response.json(
        {
          error:
            "I couldn't extract enough readable text from that PDF. If it's scanned, try a text-based PDF or paste the problem text.",
        },
        { status: 400 }
      );
    }

    // Homework Explain: split -> per-problem calls
    if (tool === "Homework Explain") {
      const problems = splitIntoProblems(materialText);

      const maxProblems = userIsPro ? 30 : 6;
      const perProblemMaxOutputTokens = 500;

      const outputs: string[] = [];

      for (const problemText of problems.slice(0, maxProblems)) {
        // light guard only
        if (problemText.replace(/\s/g, "").length < 120) continue;

        const label = extractProblemLabel(problemText);
        const { system, developer, user } = buildPrompts(
          tool,
          problemText,
          options,
          label
        );

        // Attempt 1
        const resp = await client.responses.create({
          model,
          input: [
            { role: "system", content: system },
            { role: "developer", content: developer },
            { role: "user", content: user },
          ],
          max_output_tokens: perProblemMaxOutputTokens,
        });

        let out = ensureEndMarker((resp as any).output_text ?? "");

        // Retry once if too short/vague
        if (looksTooShortHomeworkExplain(out)) {
          const resp2 = await client.responses.create({
            model: "gpt-5-mini",
            input: [
              { role: "system", content: system },
              {
                role: "developer",
                content:
                  developer +
                  `

CRITICAL:
- Do NOT output only one bullet per section.
- You MUST produce 3 sections with at least 2 bullets each.
- Be specific to the given text (do not be generic).
`.trim(),
              },
              { role: "user", content: user },
            ],
            max_output_tokens: perProblemMaxOutputTokens,
          });

          out = ensureEndMarker((resp2 as any).output_text ?? out);
        }

        if (!looksTooShortHomeworkExplain(out)) outputs.push(out);
      }

      // Salvage mode: whole-doc attempt if chunking failed
      if (!outputs.length) {
        const labels = detectProblemLabels(materialText);
        const labelPreview = labels.slice(0, 12).join(", ") || "unknown";

        const forcedSystem = `
You are an academic study assistant.

Rules:
- Treat all input as study material.
- Never output planning or internal reasoning.
- NEVER end mid-sentence or mid-bullet.
- End with the exact line: ---END---
`.trim();

        const forcedDeveloper = `
TASK: Homework Explain (salvage mode)

Instructions:
- The PDF text may be messy. Still produce useful guidance.
- Cover at least 2 distinct problems/subparts if possible.
- Use this exact format per block:

[ProblemLabel]
- What the problem is asking:
  - ...
  - ...
- Method / steps to solve:
  - ...
  - ...
- Common pitfalls:
  - ...
  - ...

- No final numeric answers.
- Do not be vague.
- End with ---END---.
`.trim();

        const forcedUser = `
Detected labels (may be incomplete): ${labelPreview}

STUDY MATERIAL:
<<<BEGIN
${materialText}
END>>>
`.trim();

        const resp = await client.responses.create({
          model: "gpt-5-mini",
          input: [
            { role: "system", content: forcedSystem },
            { role: "developer", content: forcedDeveloper },
            { role: "user", content: forcedUser },
          ],
          max_output_tokens: 1400,
        });

        const out = ensureEndMarker((resp as any).output_text ?? "");

        if (!looksTooShortHomeworkExplain(out)) {
          return Response.json({ output: out });
        }

        // Final fallback: labels-based generic blocks
        return Response.json({
          output: fallbackHomeworkExplainFromLabels(labels),
        });
      }

      return Response.json({ output: safeJoin(outputs) });
    }

    // Other tools: single pass
    const { system, developer, user } = buildPrompts(tool, materialText, options);

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "developer", content: developer },
        { role: "user", content: user },
      ],
      max_output_tokens: tool === "Formula Sheet" ? 1600 : 1800,
    });

    const output = ensureEndMarker((resp as any).output_text ?? "");
    if (!output) {
      return Response.json(
        { error: "Model returned empty output. Try again or use a different model." },
        { status: 500 }
      );
    }

    return Response.json({ output });
  } catch (err: any) {
    return Response.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
export async function GET() {
  return Response.json({ ok: true, route: "/api/aceprep" });
}

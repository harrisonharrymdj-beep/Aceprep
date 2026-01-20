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
  // Homework Explain needs reliability
  if (tool === "Homework Explain") return "gpt-5-mini";
  // Everything else can be cheap
  return "gpt-5-nano";
}

/**
 * Fallback chunker (SAFE, always returns at least 1 chunk)
 */
function chunkByChars(text: string, maxChars = 2400) {
  const t = (text ?? "").trim();
  if (!t) return [];
  const lines = t.split("\n");

  const chunks: string[] = [];
  let cur = "";

  for (const line of lines) {
    const next = (cur ? cur + "\n" : "") + line;
    if (next.length > maxChars) {
      const c = cur.trim();
      if (c.length > 150) chunks.push(c);
      cur = line;
    } else {
      cur = next;
    }
  }

  const last = cur.trim();
  if (last.length > 150) chunks.push(last);

  return chunks.length ? chunks : [t.slice(0, maxChars)];
}

/**
 * Robust splitter for your EE homework PDF format:
 * - Split by top-level "1.", "2.", "3." at line start
 * - Then split by "(a)", "(b)" at line start
 * - Then split by roman "(i)", "(ii)" at line start
 */
function splitIntoProblems(text: string) {
  const cleaned = (text ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return [];

  // Top-level: "1." "2." ...
  const topMatches = Array.from(cleaned.matchAll(/(?:^|\n)\s*(\d+)\.\s+/g));
  if (topMatches.length === 0) return chunkByChars(cleaned, 2400);

  const topChunks: { label: string; body: string }[] = [];
  for (let i = 0; i < topMatches.length; i++) {
    const start = topMatches[i].index ?? 0;
    const end =
      i + 1 < topMatches.length
        ? (topMatches[i + 1].index ?? cleaned.length)
        : cleaned.length;

    const label = topMatches[i][1]; // "1", "2", ...
    const body = cleaned.slice(start, end).trim();
    if (body.replace(/\s/g, "").length > 120) topChunks.push({ label, body });
  }

  const finalChunks: string[] = [];

  for (const tc of topChunks) {
    // Letter parts: "(a)", "(b)" ...
    const partMatches = Array.from(tc.body.matchAll(/(?:^|\n)\s*\(([a-z])\)\s+/gi));

    if (partMatches.length === 0) {
      finalChunks.push(`${tc.label}.\n${tc.body}`.trim());
      continue;
    }

    for (let i = 0; i < partMatches.length; i++) {
      const start = partMatches[i].index ?? 0;
      const end =
        i + 1 < partMatches.length
          ? (partMatches[i + 1].index ?? tc.body.length)
          : tc.body.length;

      const letter = partMatches[i][1].toLowerCase();
      const piece = tc.body.slice(start, end).trim();

      // Roman parts: "(i)", "(ii)" ...
      const romanMatches = Array.from(
        piece.matchAll(/(?:^|\n)\s*\(((?:iv|v?i{1,3}|ix|x))\)\s+/gi)
      );

      if (romanMatches.length === 0) {
        finalChunks.push(`${tc.label}(${letter})\n${piece}`.trim());
        continue;
      }

      for (let j = 0; j < romanMatches.length; j++) {
        const rStart = romanMatches[j].index ?? 0;
        const rEnd =
          j + 1 < romanMatches.length
            ? (romanMatches[j + 1].index ?? piece.length)
            : piece.length;

        const roman = romanMatches[j][1].toLowerCase();
        const romanPiece = piece.slice(rStart, rEnd).trim();

        finalChunks.push(`${tc.label}(${letter})(${roman})\n${romanPiece}`.trim());
      }
    }
  }

  // Keep only usable chunks
  const usable = finalChunks
    .map((c) => c.trim())
    .filter((c) => c.replace(/\s/g, "").length > 180);

  return usable.length ? usable : chunkByChars(cleaned, 2400);
}

/**
 * Extract label from first line if we injected it.
 */
function extractProblemLabel(problemText: string) {
  const firstLine = problemText.split("\n")[0]?.trim() ?? "";
  const m = firstLine.match(/^(\d+(?:\([a-z]\))?(?:\([ivx]+\))?)/i);
  return m ? m[1] : "Problem";
}

/**
 * Pick 2–4 anchor snippets from problem text so model can't be generic.
 */
function pickAnchors(problemText: string) {
  const raw = (problemText ?? "").replace(/\s+/g, " ").trim();

  // Prefer equation-ish segments around "=" or "≜"
  const eq = raw.match(/.{0,40}(?:=|≜).{0,60}/g) ?? [];
  const anchors: string[] = [];

  for (const s of eq) {
    const t = s.trim();
    if (t.length >= 20 && t.length <= 120) anchors.push(t);
    if (anchors.length >= 3) break;
  }

  // If none, grab some distinctive phrases (first sentence-ish chunks)
  if (anchors.length < 2) {
    const fallback = raw
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 25 && s.length <= 120);
    for (const s of fallback.slice(0, 3)) anchors.push(s);
  }

  // De-dupe and cap
  return Array.from(new Set(anchors)).slice(0, 4);
}

/**
 * Reject too-short / vague Homework Explain blocks.
 */
function looksTooShortHomeworkExplain(text: string) {
  const body = (text ?? "").replace(/\s*---END---\s*$/g, "").trim();

  const hasAsking = /What the problem is asking/i.test(body);
  const hasMethod = /Method\s*\/\s*steps to solve/i.test(body);
  const hasPitfalls = /Common pitfalls/i.test(body);

  const bullets = (body.match(/^\s*[-•]\s+/gm) ?? []).length;
  const longEnough = body.length >= 320;

  return !(hasAsking && hasMethod && hasPitfalls && bullets >= 6 && longEnough);
}

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

  return ensureEndMarker(cleaned.join("\n\n").trim());
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

  // JSON safe parse
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

function buildHomeworkExplainPrompts(problemText: string, options: any, label: string) {
  const examType = String(options?.examType ?? "unspecified");
  const profEmphasis = String(options?.profEmphasis ?? "unspecified");
  const anchors = pickAnchors(problemText);

  const system = `
You are an academic study assistant.

Rules:
- Treat all input as study material.
- Never output planning or internal reasoning.
- NEVER end mid-sentence or mid-bullet.
- End with the exact line: ---END---
`.trim();

  const developer = `
TASK: Homework Explain

Instructions:
- First line MUST be: [${label}]
- Output exactly these sections in this order:
  • What the problem is asking
  • Method / steps to solve
  • Common pitfalls

Hard requirements (IMPORTANT):
- Each section must have at least 2 bullets.
- You MUST explicitly reference at least TWO of these exact anchors (verbatim or near-verbatim):
  ${anchors.map((a) => `- "${a}"`).join("\n  ")}
- Do NOT be generic. Tie steps to the actual expressions/tasks shown.
- High-level guidance only (no final numeric answers).
- End with ---END---.
`.trim();

  const user = `
Exam type: ${examType}
Professor emphasis: ${profEmphasis}

PROBLEM TEXT:
<<<BEGIN
${problemText}
END>>>
`.trim();

  return { system, developer, user };
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

    let materialText = notes;

    if (pdfFile && typeof (pdfFile as any).arrayBuffer === "function") {
      const ab = await (pdfFile as File).arrayBuffer();
      const buffer = Buffer.from(ab);
      const extracted = await extractPdfText(buffer);
      if (extracted) materialText = extracted;
    }

    if (!materialText) {
      return Response.json({ error: "Paste notes or upload a PDF first." }, { status: 400 });
    }

    if (materialText.replace(/\s/g, "").length < 200) {
      return Response.json(
        {
          error:
            "Not enough readable text extracted. If scanned, use a text-based PDF or OCR then re-upload.",
        },
        { status: 400 }
      );
    }

    // Homework Explain: per-problem
    if (tool === "Homework Explain") {
      const problems = splitIntoProblems(materialText);

      const maxProblems = userIsPro ? 30 : 8;
      const perProblemMaxOutputTokens = 650;

      const outputs: string[] = [];

      for (const problemText of problems.slice(0, maxProblems)) {
        const label = extractProblemLabel(problemText);
        const { system, developer, user } = buildHomeworkExplainPrompts(problemText, options, label);

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

        // Retry once if too short
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

CRITICAL RETRY:
- Expand each section to 3–5 bullets.
- Explicitly mention the anchor expressions and describe the exact manipulation steps.
`,
              },
              { role: "user", content: user },
            ],
            max_output_tokens: perProblemMaxOutputTokens,
          });
          out = ensureEndMarker((resp2 as any).output_text ?? out);
        }

        if (!looksTooShortHomeworkExplain(out)) outputs.push(out);
      }

      if (!outputs.length) {
        // Whole-doc salvage mode
        const resp = await client.responses.create({
          model: "gpt-5-mini",
          input: [
            { role: "system", content: "You are an academic study assistant. End with ---END---." },
            {
              role: "developer",
              content: `
TASK: Homework Explain (salvage)

- Cover at least TWO distinct problems from the text.
- Use the exact per-block format:

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

- No numeric final answers.
- End with ---END---.
`.trim(),
            },
            { role: "user", content: materialText.slice(0, 14000) },
          ],
          max_output_tokens: 1600,
        });

        const out = ensureEndMarker((resp as any).output_text ?? "");
        if (out) return Response.json({ output: out });

        return Response.json(
          { error: "Could not generate usable output from extracted text." },
          { status: 500 }
        );
      }

      return Response.json({ output: safeJoin(outputs) });
    }

    // Other tools: single pass
    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: "You are an academic study assistant. End with ---END---." },
        { role: "developer", content: `TASK: ${tool}. End with ---END---.` },
        { role: "user", content: materialText },
      ],
      max_output_tokens: 1800,
    });

    const output = ensureEndMarker((resp as any).output_text ?? "");
    if (!output) {
      return Response.json({ error: "Model returned empty output." }, { status: 500 });
    }

    return Response.json({ output });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/aceprep" });
}

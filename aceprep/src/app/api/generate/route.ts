// src/app/api/aceprep/route.ts
import OpenAI from "openai";
import * as pdfParseNS from "pdf-parse";
import { Buffer } from "node:buffer";


async function extractPdfText(buffer: Buffer) {
  const pdfParse: any = (pdfParseNS as any).default ?? pdfParseNS;
  const data = await pdfParse(buffer);
  return (data?.text ?? "").trim();
}


export const runtime = "nodejs";

/**
 * Lazy client (prevents build-time crashes)
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
 * - Use nano for cheap + fast once you pre-split the PDF.
 */
function modelForTool(tool: string) {
  if (tool === "Homework Explain") return "gpt-5-mini"; // reliability
  return "gpt-5-nano"; // cheap for everything else
}

/**
 * Split assignment into "problem units".
 * This is intentionally heuristic (works well for typical EE homework PDFs).
 */
function splitIntoProblems(text: string) {
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Common patterns:
  // 1
  // 1.
  // Problem 1
  // 1(a)
  // 3(b)(ii)
  const parts = cleaned.split(
    /\n(?=(?:Problem\s*)?\d+\s*(?:[\.\)]|\([a-z]\)|\([a-z]\)\([ivx]+\)|\([ivx]+\)))/i
  );

const units = parts.map((p) => p.trim()).filter((p) => p.length > 40);

  // Fallback if split fails (single big blob)
  if (units.length <= 1) {
    return chunkByChars(cleaned, 2200);
  }

  return units;
}

/**
 * Safe fallback chunker if problem splitting fails.
 */
function chunkByChars(text: string, maxChars = 2200) {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let cur = "";

  for (const line of lines) {
    if ((cur + line + "\n").length > maxChars) {
      if (cur.trim()) chunks.push(cur.trim());
      cur = "";
    }
    cur += line + "\n";
  }
  if (cur.trim()) chunks.push(cur.trim());

  return chunks;
}

/**
 * Minimal prompt contract per tool (no retries / no continuation prompts).
 */
function buildPrompts(tool: string, notes: string, options?: any) {
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
- First line MUST be: [Problem]
- You will be given ONE problem chunk at a time.
- Output exactly these sections:
  • What the problem is asking
  • Method / steps to solve
  • Common pitfalls
- High-level guidance only (no final numeric answers).
- Use bullets.
- End with ---END---.
`.trim();

    const user = `
Exam type: ${examType}
Professor emphasis: ${profEmphasis}

PROBLEM TEXT (may include the label like 1(a), 2(b), etc):
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

function ensureEndMarker(text: string) {
  const t = (text ?? "").trimEnd();
  if (t.endsWith("---END---")) return t;
  return t + "\n---END---";
}

function safeJoin(outputs: string[]) {
  // strip extra END markers from intermediate chunks
  const cleaned = outputs
    .map((o) => (o ?? "").replace(/\s*---END---\s*$/g, "").trimEnd())
    .filter(Boolean);
  return ensureEndMarker(cleaned.join("\n\n").trim());
}

/**
 * Read either JSON or multipart/form-data.
 * - JSON: { tool, notes, options }
 * - FormData: tool, options (JSON string), notes (optional), pdf (File)
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

  // default JSON
  const body = await req.json();
  const tool = String(body.tool ?? "Study Guide");
  const notes = String(body.notes ?? "").trim();
  const options = body.options ?? {};
  return { tool, notes, options, pdfFile: null as any };
}

export async function POST(req: Request) {
  try {
    const { tool, notes, options, pdfFile } = await readRequest(req);

    // Optional: simple Pro gate placeholder
    const userIsPro = false;
    if (tool === "Exam Pack" && !userIsPro) {
      return Response.json({ error: "Exam Pack is Pro-only." }, { status: 403 });
    }

    const client = getClient();
    const model = modelForTool(tool);

  // 1) If PDF uploaded, extract text server-side
let materialText = notes;

if (pdfFile && typeof (pdfFile as any).arrayBuffer === "function") {
  const ab = await (pdfFile as File).arrayBuffer();
  const buffer = Buffer.from(ab);
  const extracted = await extractPdfText(buffer);

  if (extracted) materialText = extracted;

  // ✅ guard: pdf extracted too little text
  if (!materialText || materialText.replace(/\s/g, "").length < 200) {
    return Response.json(
      {
        error:
          "I couldn't extract enough readable text from that PDF. Try another PDF or paste the text content.",
      },
      { status: 400 }
    );
  }
}

// ✅ also guard for non-pdf requests
if (!materialText) {
  return Response.json(
    { error: "Paste notes or upload a PDF first." },
    { status: 400 }
  );
}


    // 2) If Homework Explain, split into problems and process per-problem
    if (tool === "Homework Explain") {
      const problems = splitIntoProblems(materialText);

      // Budget controls (this is what makes ads/profit predictable)
      // You can tune these to your ad strategy.
      const maxProblems = userIsPro ? 30 : 6;

      // Per-problem output cap keeps responses tight + consistent
      const perProblemMaxOutputTokens = 450;

      const outputs: string[] = [];
      for (const problemText of problems.slice(0, maxProblems)) {
        const { system, developer, user } = buildPrompts(tool, problemText, options);

        const resp = await client.responses.create({
          model,
          input: [
            { role: "system", content: system },
            { role: "developer", content: developer },
            { role: "user", content: user },
          ],
          max_output_tokens: perProblemMaxOutputTokens,
        });

        const out = ensureEndMarker((resp as any).output_text ?? "");
        outputs.push(out);
      }

      const combined = safeJoin(outputs);
      return Response.json({ output: combined });
    }

    // 3) Other tools: single pass
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
    return Response.json({ output });
  } catch (err: any) {
    return Response.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

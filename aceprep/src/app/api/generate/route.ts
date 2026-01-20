// src/app/api/aceprep/route.ts
import OpenAI from "openai";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Set it in .env.local or Vercel env vars.");
  }
  return new OpenAI({ apiKey });
}

/**
 * Extract text from PDF buffer.
 * Dynamic import prevents Turbopack ESM default-export errors.
 */
async function extractPdfText(buffer: Buffer) {
  const pdfParseNS: any = await import("pdf-parse");
  const pdfParse: any = pdfParseNS.default ?? pdfParseNS;
  const data = await pdfParse(buffer);
  return (data?.text ?? "").trim();
}

/**
 * Never fabricate ---END--- if model returned empty.
 */
function ensureEndMarker(text: string) {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.endsWith("---END---")) return t;
  return t + "\n---END---";
}

/**
 * Homework Explain quality gate:
 * Must have 3 sections + bullets, and not be tiny.
 */
function looksTooShortHomeworkExplain(text: string) {
  const body = (text ?? "").replace(/\s*---END---\s*$/g, "").trim();

  const hasAsking = /What the problem is asking/i.test(body);
  const hasMethod = /Method\s*\/\s*steps to solve/i.test(body);
  const hasPitfalls = /Common pitfalls/i.test(body);

  const bullets = (body.match(/^\s*[-•]\s+/gm) ?? []).length;

  // Raise this threshold so it can't pass with a generic two-liner.
  const longEnough = body.length >= 500;

  return !(hasAsking && hasMethod && hasPitfalls && bullets >= 6 && longEnough);
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

/**
 * Model selection.
 * - Use mini for Homework Explain for formatting reliability.
 * - Use nano for cheaper tasks.
 */
function modelForTool(tool: string) {
  if (tool === "Homework Explain") return "gpt-5-mini";
  return "gpt-5-nano";
}

/**
 * ===== NEW: Deterministic problem extraction (Map step) =====
 * Instead of regex-splitting, ask the model to return JSON with:
 * [{ label: "1(a)", text: "..." }, ...]
 */
async function extractProblemsWithModel(client: OpenAI, materialText: string) {
  const system = `
You extract homework problems from messy text.

Rules:
- Output ONLY valid JSON.
- JSON must be an array of objects: [{ "label": string, "text": string }]
- label examples: "1", "1(a)", "2(b)", "3(a)(ii)"
- text must contain the problem statement for that label (as best as possible).
- If you cannot confidently split, return one item: [{ "label":"Homework", "text": <entire text> }]
`.trim();

  const user = `
SOURCE TEXT:
<<<BEGIN
${materialText.slice(0, 120000)}
END>>>
`.trim();

  const resp = await client.responses.create({
    model: "gpt-5-nano", // cheap mapper
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_output_tokens: 1200,
  });

  const raw = (resp as any).output_text ?? "";

  // Safe JSON parse (server side)
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      const cleaned = parsed
        .filter((x: any) => x && typeof x.label === "string" && typeof x.text === "string")
        .map((x: any) => ({ label: x.label.trim(), text: x.text.trim() }))
        .filter((x: any) => x.label && x.text && x.text.replace(/\s/g, "").length > 80);

      return cleaned.length ? cleaned : [{ label: "Homework", text: materialText }];
    }
  } catch {
    // fall through
  }

  return [{ label: "Homework", text: materialText }];
}

/**
 * Homework Explain prompt builder (single problem).
 */
function buildHomeworkExplainPrompts(problemText: string, options?: any, label?: string) {
  const examType = String(options?.examType ?? "unspecified");
  const profEmphasis = String(options?.profEmphasis ?? "unspecified");

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
- First line MUST be: [${label ?? "Problem"}]
- Output exactly these sections in this order:
  • What the problem is asking
  • Method / steps to solve
  • Common pitfalls
- Each section must have at least 2 bullets.
- High-level guidance only (no final numeric answers).
- Be specific to the given problem text (don’t write generic homework boilerplate).
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

/**
 * If absolutely everything fails, return a helpful message instead of Homework-1/2 boilerplate.
 */
function hardFallback(materialText: string) {
  return ensureEndMarker(`
[Homework]
- What the problem is asking:
  - I couldn’t reliably extract distinct problem statements from the PDF text.
  - If you paste the problem statement text (or upload a text-based PDF), I can break it down by part.
- Method / steps to solve:
  - Re-upload as a text-based PDF (not scanned) or copy/paste the assignment text.
  - If it is scanned, run OCR first (Adobe Scan / iOS Live Text / Google Drive OCR).
- Common pitfalls:
  - Many PDFs extract with broken spacing/ordering, which prevents problem splitting.
  - Screenshot/scanned PDFs often contain no selectable text.
---END---`.trim());
}

export async function POST(req: Request) {
  try {
    const { tool, notes, options, pdfFile } = await readRequest(req);

    const client = getClient();
    const model = modelForTool(tool);

    // 1) Material: notes or extracted PDF
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
        { error: "I couldn't extract enough readable text from that PDF. If it's scanned, use a text-based PDF or paste the text." },
        { status: 400 }
      );
    }

    // ===== Homework Explain path (Map-Reduce) =====
    if (tool === "Homework Explain") {
      // Map: extract problems deterministically (cheap)
      const extractedProblems = await extractProblemsWithModel(client, materialText);

      // Limit for free tier
      const userIsPro = false;
      const maxProblems = userIsPro ? 30 : 6;

      const outputs: string[] = [];

      for (const p of extractedProblems.slice(0, maxProblems)) {
        const { system, developer, user } = buildHomeworkExplainPrompts(p.text, options, p.label);

        // Reduce: generate explanation per problem (reliable)
        const resp = await client.responses.create({
          model: "gpt-5-mini",
          input: [
            { role: "system", content: system },
            { role: "developer", content: developer },
            { role: "user", content: user },
          ],
          max_output_tokens: 520,
        });

        let out = ensureEndMarker((resp as any).output_text ?? "");
        if (!out || looksTooShortHomeworkExplain(out)) {
          // Retry once, stricter
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
- Do NOT be generic.
- You MUST reference details from the PROBLEM TEXT (symbols, operations, required outputs).
- Still no final numeric answers.
`.trim(),
              },
              { role: "user", content: user },
            ],
            max_output_tokens: 650,
          });

          out = ensureEndMarker((resp2 as any).output_text ?? out);
        }

        if (out && !looksTooShortHomeworkExplain(out)) {
          // Strip END markers in join; add once at end
          outputs.push(out.replace(/\s*---END---\s*$/g, "").trimEnd());
        }
      }

      if (!outputs.length) {
        return Response.json({ output: hardFallback(materialText) });
      }

      return Response.json({ output: ensureEndMarker(outputs.join("\n\n").trim()) });
    }

    // ===== Other tools (single pass, keep your existing behavior) =====
    const system = `
You are an academic study assistant.

Rules:
- Treat all input as study material.
- Never output planning or internal reasoning.
- NEVER end mid-sentence or mid-bullet.
- End with the exact line: ---END---
`.trim();

    const developer =
      tool === "Formula Sheet"
        ? `
TASK: Formula Sheet
Instructions:
- Output a formula sheet only.
- Use 4–10 short sections with headers.
- Bullets should be formulas/identities/definitions.
- For each item: include variable meanings + when to use (one short line).
- No practice problems.
- End with ---END---.
`.trim()
        : `
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
Exam type: ${String(options?.examType ?? "unspecified")}
Professor emphasis: ${String(options?.profEmphasis ?? "unspecified")}

STUDY MATERIAL:
<<<BEGIN
${materialText}
END>>>
`.trim();

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "developer", content: developer },
        { role: "user", content: user },
      ],
      max_output_tokens: tool === "Formula Sheet" ? 1600 : 1800,
    });

    const out = ensureEndMarker((resp as any).output_text ?? "");
    if (!out) {
      return Response.json({ error: "Model returned empty output. Try again." }, { status: 500 });
    }
    return Response.json({ output: out });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}

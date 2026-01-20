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
 * Best-effort label extractor for chunks ("1", "1(a)", "3(b)(ii)", etc.)
 */
function extractProblemLabel(problemText: string) {
  const m = problemText.match(
    /(?:Problem\s*)?(\d+\s*(?:\([a-z]\))?(?:\([ivx]+\))?)/i
  );
  return m ? m[1].replace(/\s+/g, "") : "Problem";
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

function detectProblemLabels(text: string) {
  // Finds: 1, 1(a), 1(b), 3(a)(ii), etc.
  const re = /\b(\d+)(\([a-z]\))?(\([ivx]+\))?\b/gi;
  const found = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const label = `${m[1]}${m[2] ?? ""}${m[3] ?? ""}`.trim();
    // avoid capturing years/page numbers etc by requiring at least "digit" and (optional) parens
    if (label.length >= 1 && label.length <= 10) found.add(label);
  }

  // Keep it sane: sort numerically by first number, then by string
  return Array.from(found).sort((a, b) => {
    const an = parseInt(a, 10);
    const bn = parseInt(b, 10);
    if (an !== bn) return an - bn;
    return a.localeCompare(b);
  });
}

function fallbackHomeworkExplainFromLabels(labels: string[]) {
  const blocks = labels.slice(0, 10).map((label) => {
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

  const body = blocks.length
    ? blocks.join("\n\n")
    : `[Homework]\n- What the problem is asking:\n  - The PDF text was not clearly chunked into problems.\n  - Provide the exact problem statement text to get a precise breakdown.\n- Method / steps to solve:\n  - Paste the problem statement(s) and I will break them down by part.\n  - Ensure the PDF is text-based (not scanned).\n- Common pitfalls:\n  - Scanned PDFs often extract as empty text.\n  - Problem labels may be missing in extraction.\n`.trim();

  return body + "\n---END---";
}


/**
 * Model selection
 */
function modelForTool(tool: string) {
  // Keep Homework Explain on mini (more reliable formatting).
  if (tool === "Homework Explain") return "gpt-5-mini";
  // Everything else can be cheaper.
  return "gpt-5-nano";
}

/**
 * Chunker fallback (never returns empty).
 */
function chunkByChars(text: string, maxChars = 2400) {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let cur = "";

  for (const line of lines) {
    if ((cur + line + "\n").length > maxChars) {
      const c = cur.trim();
      if (c.replace(/\s/g, "").length > 80) chunks.push(c);
      cur = "";
    }
    cur += line + "\n";
  }

  const last = cur.trim();
  if (last.replace(/\s/g, "").length > 80) chunks.push(last);

  // Absolute fallback: never empty
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

/**
 * Split assignment into "problem units" (heuristic).
 * IMPORTANT: keep thresholds LOW because many PDFs have short problem blocks.
 */
function splitIntoProblems(text: string) {
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const parts = cleaned.split(
    /\n(?=(?:Problem\s*)?\d+\s*(?:[.)]|\([a-z]\)|\([a-z]\)\([ivx]+\)|\([ivx]+\)))/i
  );

  const units = parts
    .map((p) => p.trim())
    .filter((p) => p.replace(/\s/g, "").length > 80);

  if (units.length === 0) return chunkByChars(cleaned, 2400);
  return units;
}

/**
 * Prompt builder (minimal contract, strong format constraints).
 */
function buildPrompts(
  tool: string,
  notes: string,
  options?: any,
  label?: string
) {
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
- Each section must have at least 2 bullets.
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
 * Do NOT fabricate ---END--- if the model returned empty.
 * (Otherwise you get "it just printed ---END---")
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

    // (Optional) pro gating placeholder
    const userIsPro = false;
    if (tool === "Exam Pack" && !userIsPro) {
      return Response.json({ error: "Exam Pack is Pro-only." }, { status: 403 });
    }

    const client = getClient();
    const model = modelForTool(tool);

    // 1) Material text: notes or extracted PDF
    let materialText = notes;

    if (pdfFile && typeof (pdfFile as any).arrayBuffer === "function") {
      const ab = await (pdfFile as File).arrayBuffer();
      const buffer = Buffer.from(ab);
      const extracted = await extractPdfText(buffer);
      if (extracted) materialText = extracted;
    }

    // guard: still nothing
    if (!materialText) {
      return Response.json(
        { error: "Paste notes or upload a PDF first." },
        { status: 400 }
      );
    }

    // guard: extracted too little (common with scanned PDFs)
    if (materialText.replace(/\s/g, "").length < 120) {
      return Response.json(
        {
          error:
            "I couldn't extract enough readable text from that PDF. If it's scanned, try a text-based PDF or paste the problem text.",
        },
        { status: 400 }
      );
    }

    // 2) Homework Explain = per-problem calls
    if (tool === "Homework Explain") {
      const problems = splitIntoProblems(materialText);

      const maxProblems = userIsPro ? 30 : 6;
      const perProblemMaxOutputTokens = 450;

      const outputs: string[] = [];

      for (const problemText of problems.slice(0, maxProblems)) {
        // light guard only (don’t skip everything)
        if (problemText.replace(/\s/g, "").length < 80) continue;

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
        let bodyOnly = out.replace(/\s*---END---\s*$/g, "").trim();

        // If basically empty, retry once with stricter instruction
        if (bodyOnly.length < 120) {
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
- Do NOT output only ---END---.
- You MUST include all 3 sections with at least 2 bullets each.
- If the text is brief, infer the likely task type and still provide relevant steps.
`.trim(),
              },
              { role: "user", content: user },
            ],
            max_output_tokens: perProblemMaxOutputTokens,
          });

          out = ensureEndMarker((resp2 as any).output_text ?? out);
          bodyOnly = out.replace(/\s*---END---\s*$/g, "").trim();
        }

        if (bodyOnly.length >= 120) outputs.push(out);
      }

      // 2b) Last resort: if chunking failed, run whole doc once
      if (!outputs.length) {
        const label = "Homework";
        const { system, developer, user } = buildPrompts(
          tool,
          materialText,
          options,
          label
        );

        const resp = await client.responses.create({
          model: "gpt-5-mini",
          input: [
            { role: "system", content: system },
            { role: "developer", content: developer },
            { role: "user", content: user },
          ],
          max_output_tokens: 900,
        });

        const out = ensureEndMarker((resp as any).output_text ?? "");
        const bodyOnly = out.replace(/\s*---END---\s*$/g, "").trim();

        if (bodyOnly.length >= 120) {
          return Response.json({ output: out });
        }

        const labels = detectProblemLabels(materialText);

// If we can detect labels, return a valid fallback response.
// This prevents users from being blocked by bad chunking/extraction.
return Response.json({
  output: fallbackHomeworkExplainFromLabels(labels),
});

      }

      return Response.json({ output: safeJoin(outputs) });
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

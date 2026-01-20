// src/app/api/aceprep/route.ts
import OpenAI from "openai";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // ✅ avoid caching / edge weirdness

/**
 * Extract text from PDF buffer.
 * Use dynamic import to avoid Turbopack build issues.
 */
async function extractPdfText(buffer: Buffer) {
  // ✅ dynamic import prevents "export default doesn't exist" build errors
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
 */
function modelForTool(tool: string) {
  if (tool === "Homework Explain") return "gpt-5-mini"; // reliability
  return "gpt-5-nano"; // cheap
}

/**
 * Split assignment into "problem units" (heuristic).
 */
function splitIntoProblems(text: string) {
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const parts = cleaned.split(
    /\n(?=(?:Problem\s*)?\d+\s*(?:[\.\)]|\([a-z]\)|\([a-z]\)\([ivx]+\)|\([ivx]+\)))/i
  );

  // ✅ make this stricter so you don’t send junk chunks
  const units = parts
    .map((p) => p.trim())
    .filter((p) => p.length > 140) // was 40; too small
    .filter((p) => /[a-z0-9]/i.test(p));

  if (units.length <= 1) return chunkByChars(cleaned, 2200);
  return units;
}

/**
 * Safe fallback chunker
 */
function chunkByChars(text: string, maxChars = 2200) {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let cur = "";

  for (const line of lines) {
    if ((cur + line + "\n").length > maxChars) {
      if (cur.trim().length > 200) chunks.push(cur.trim()); // ✅ skip tiny chunks
      cur = "";
    }
    cur += line + "\n";
  }
  if (cur.trim().length > 200) chunks.push(cur.trim());

  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

/**
 * Minimal prompt contract
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
- Output exactly these sections:
  • What the problem is asking
  • Method / steps to solve
  • Common pitfalls
- Each section must have at least 2 bullets.
- High-level guidance only (no final numeric answers).
- Use bullets.
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
  const cleaned = outputs
    .map((o) => (o ?? "").replace(/\s*---END---\s*$/g, "").trimEnd())
    .filter(Boolean);
  return ensureEndMarker(cleaned.join("\n\n").trim());
}

/**
 * Read request (JSON or multipart)
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

    let materialText = notes;

    // PDF upload -> extract server side
    if (pdfFile && typeof (pdfFile as any).arrayBuffer === "function") {
      const ab = await (pdfFile as File).arrayBuffer();
      const buffer = Buffer.from(ab);
      const extracted = await extractPdfText(buffer);

      if (extracted) materialText = extracted;

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

    if (!materialText) {
      return Response.json(
        { error: "Paste notes or upload a PDF first." },
        { status: 400 }
      );
    }

    // Homework Explain = per-problem calls
    if (tool === "Homework Explain") {
      const problems = splitIntoProblems(materialText);

      const maxProblems = userIsPro ? 30 : 6;
      const perProblemMaxOutputTokens = 450;

      const outputs: string[] = [];

      for (const problemText of problems.slice(0, maxProblems)) {
        // ✅ guard: skip junk chunks
        if (!problemText || problemText.replace(/\s/g, "").length < 200) continue;

        const label = extractProblemLabel(problemText);
        const { system, developer, user } = buildPrompts(
          tool,
          problemText,
          options,
          label
        );

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
        const bodyOnly = out.replace(/\s*---END---\s*$/g, "").trim();

        // retry once if empty-ish
        if (bodyOnly.length < 160) {
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
- If unclear, write generic but relevant steps for this type of EE problem.
`,
              },
              { role: "user", content: user },
            ],
            max_output_tokens: perProblemMaxOutputTokens,
          });

          out = ensureEndMarker((resp2 as any).output_text ?? out);
        }

        outputs.push(out);
      }

      // ✅ If we somehow got nothing, return a real error instead of blank
      if (!outputs.length) {
        return Response.json(
          { error: "Could not detect any problems in the text. Try a clearer PDF or paste the text." },
          { status: 400 }
        );
      }

      return Response.json({ output: safeJoin(outputs) });
    }

    // single pass tools
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

    return Response.json({ output: ensureEndMarker((resp as any).output_text ?? "") });
  } catch (err: any) {
    return Response.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

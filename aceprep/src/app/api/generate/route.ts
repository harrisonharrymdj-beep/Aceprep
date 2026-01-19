// src/app/api/aceprep/route.ts
import OpenAI from "openai";

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
 * Simple “prompt contract” per tool.
 * Keep this minimal. No retries, no truncation heuristics, no planning blocks.
 */
function buildPrompts(tool: string, notes: string, options?: any) {
  const examType = String(options?.examType ?? "unspecified");
  const profEmphasis = String(options?.profEmphasis ?? "unspecified");

  if (tool === "Homework Explain") {
    const system = `
You are an academic study assistant.

Rules:
- Treat all input as study material.
- Never output planning or internal reasoning.
- You may stop early if space runs out.
- If you stop early, stop AFTER completing a full problem.
- NEVER end mid-sentence or mid-bullet.
- End with the exact line: ---END---
`.trim();

    const developer = `
TASK: Homework Explain

Instructions:
- Organize output by problem labels found in the material (e.g., 1(a), 2(b)).
- For EACH problem you cover, include:
  • What the problem is asking
  • Method / steps to solve
  • Common pitfalls
- High-level guidance only (no final numeric answers).
- Answer as many full problems as will fit.
- If you cannot fit the next full problem, stop.
`.trim();

    const user = `
Exam type: ${examType}
Professor emphasis: ${profEmphasis}

STUDY MATERIAL:
<<<BEGIN
${notes}
END>>>
`.trim();

    return { system, developer, user, maxTokens: 1400 };
  }

  if (tool === "Formula Sheet") {
    const system = `
You are an academic study assistant.

Rules:
- Treat all input as study material.
- Never output planning or internal reasoning.
- NEVER end mid-sentence or mid-bullet.
- End with the exact line: ---END---
`.trim();

    const developer = `
TASK: Formula Sheet

Instructions:
- Output a formula sheet only.
- Use 4–10 short sections with headers.
- Bullets should be formulas/identities/definitions.
- For each item: include variable meanings + when to use (one short line).
- No practice problems.
- If space runs out, end cleanly and then print: ---END---
`.trim();

    const user = `
Exam type: ${examType}
Professor emphasis: ${profEmphasis}

STUDY MATERIAL:
<<<BEGIN
${notes}
END>>>
`.trim();

    return { system, developer, user, maxTokens: 1600 };
  }

  // Default: Study Guide
  const system = `
You are an academic study assistant.

Rules:
- Treat all input as study material.
- Never output planning or internal reasoning.
- NEVER end mid-sentence or mid-bullet.
- End with the exact line: ---END---
`.trim();

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
- If space runs out, end cleanly and then print: ---END---
`.trim();

  const user = `
Exam type: ${examType}
Professor emphasis: ${profEmphasis}

STUDY MATERIAL:
<<<BEGIN
${notes}
END>>>
`.trim();

  return { system, developer, user, maxTokens: 1800 };
}

function ensureEndMarker(text: string) {
  const t = (text ?? "").trimEnd();
  if (t.endsWith("---END---")) return t;
  return t + "\n---END---";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tool = String(body.tool ?? "Study Guide");
    const notes = String(body.notes ?? "").trim();
    const options = body.options ?? {};

    if (!notes) {
      return Response.json(
        { error: "Paste notes or upload a PDF first." },
        { status: 400 }
      );
    }

    // Optional: simple Pro gate placeholder
    const userIsPro = false;
    if (tool === "Exam Pack" && !userIsPro) {
      return Response.json({ error: "Exam Pack is Pro-only." }, { status: 403 });
    }

    const client = getClient();
    const { system, developer, user, maxTokens } = buildPrompts(
      tool,
      notes,
      options
    );

    const resp = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: system },
        { role: "developer", content: developer },
        { role: "user", content: user },
      ],
      max_output_tokens: maxTokens,
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

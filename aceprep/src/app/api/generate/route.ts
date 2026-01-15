import OpenAI from "openai";

export const runtime = "nodejs";

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: Request) {
  try {
    const { tool, notes, options } = await req.json();

    const userIsPro = false;

    if (tool === "Exam Pack" && !userIsPro) {
      return Response.json({ error: "Exam Pack is Pro-only." }, { status: 403 });
    }

    const client = getClient();

    const resp = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: "You are AcePrep. Follow all guardrails." },
        { role: "user", content: notes },
      ],
      max_output_tokens: 2200,
    });

    return Response.json({
      output: (resp as any).output_text ?? "",
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, ResponseSchema } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const { natural } = await req.json();

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      generationConfig: { temperature: 0.3 },
    });

    // Response schema keeps it minimal and generic.
    const responseSchema: ResponseSchema = {
      type: SchemaType.OBJECT,
      properties: {
        intent: { type: SchemaType.STRING }, // Short one-liner the agent will open with
        slots: {
          type: SchemaType.OBJECT,
          // Common but *not enforced* keys. Gemini can include anything else too.
          properties: {
            target: { type: SchemaType.STRING }, // “Comcast”, “Thai House”, “Dr. Kim”, “911”
            phone: { type: SchemaType.STRING },  // +1...
            when: { type: SchemaType.STRING },   // “tonight 8pm”, “tomorrow morning”, ISO ok
            count: { type: SchemaType.STRING },  // party size or quantity if relevant
            account: { type: SchemaType.STRING },// account/ref/policy id
            callback: { type: SchemaType.STRING }, // number to leave on voicemail
            notes: { type: SchemaType.STRING },  // extra instructions
            // Model may include other keys (e.g., “doctor”, “orderId”) even if not enumerated.
          },
        },
        required: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING }, // which slot keys must be present before dialing
        },
        ivr: {
          type: SchemaType.OBJECT,
          properties: {
            autoNavigate: { type: SchemaType.BOOLEAN },
            sendDigits: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }, // ["2","1","0"]
            },
            languagePref: { type: SchemaType.STRING },
          },
        },
        safety: {
          type: SchemaType.OBJECT,
          properties: {
            emergency: { type: SchemaType.BOOLEAN },
            warn: { type: SchemaType.STRING },
          },
        },
      },
      required: ["intent", "slots", "required"],
    };

    const SYSTEM = `You are the pre-call planner for a phone agent.
- Read the user's natural request.
- Produce: 
  1) intent: a short one-liner the agent will open with (what outcome to achieve).
  2) slots: extracted information needed to complete the call (target, phone, when, count, account, callback, notes, etc.). Include only what is relevant; you may add new keys as needed.
  3) required: array of slot keys that MUST be known *before dialing* to avoid stalling.
  4) ivr (optional): if the user described phone menu steps, set sendDigits as a sequence like ["2","1","0"]. Set autoNavigate=true if we should try.
  5) safety (optional): emergency=true if the user describes an emergency (e.g., “call 911”). warn can include a short reminder like “Emergency calling policies vary.”
- Do NOT invent phone numbers; if unknown, leave phone empty and add "phone" to required.
- Keep outputs concise and grounded in the user's text.`;

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: SYSTEM }] },
        { role: "user", parts: [{ text: `User request: ${natural || ""}` }] },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    let parsed: any;
    try {
      parsed = JSON.parse(result.response.text());
    } catch {
      // Robust fallback so UI doesn’t break
      parsed = {
        intent: "Make the requested call and achieve the stated outcome.",
        slots: {},
        required: ["target", "phone"],
      };
    }

    // Minimal post-process: ensure shapes exist
    parsed.slots = parsed.slots || {};
    parsed.required = Array.isArray(parsed.required) ? parsed.required : ["target", "phone"];
    parsed.ivr = parsed.ivr || { autoNavigate: true, sendDigits: [] };
    parsed.safety = parsed.safety || { emergency: false, warn: null };

    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error("PLAN_ERROR", e?.message || e);
    return NextResponse.json(
      { intent: "", slots: {}, required: ["target", "phone"] },
      { status: 200 }
    );
  }
}

import { NextResponse } from "next/server";

export const runtime = "nodejs"; // Twilio requires Node runtime (no edge)

type CallRequest = {
  to?: string;
  from?: string;
  url?: string;
};

export async function POST(req: Request) {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { sid: null, status: "missing-credentials", error: "Twilio credentials are not configured." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as CallRequest;
    const to = body.to?.trim();
    const from = (body.from || process.env.TWILIO_FROM_NUMBER || "").trim();
    const url = body.url || process.env.TWILIO_VOICE_URL || "http://demo.twilio.com/docs/voice.xml";

    if (!to) {
      return NextResponse.json(
        { sid: null, status: "missing-destination", error: "Destination phone required." },
        { status: 400 }
      );
    }

    if (!from) {
      return NextResponse.json(
        { sid: null, status: "missing-source", error: "Set TWILIO_FROM_NUMBER or include `from`." },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({ To: to, From: from, Url: url });
    const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params,
      }
    );

    const contentType = twilioResponse.headers.get("content-type");
    const isJson = contentType?.includes("application/json");
    const payload = isJson ? await twilioResponse.json() : await twilioResponse.text();

    if (!twilioResponse.ok) {
      const errorMessage = typeof payload === "string" ? payload : payload?.message || "Twilio call failed.";
      return NextResponse.json(
        { sid: null, status: "twilio-error", error: errorMessage },
        { status: twilioResponse.status }
      );
    }

    return NextResponse.json({
      sid: typeof payload === "string" ? null : payload?.sid ?? null,
      status: typeof payload === "string" ? "queued" : payload?.status ?? "queued",
      to,
      from,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body";
    return NextResponse.json(
      { sid: null, status: "invalid-request", error: message },
      { status: 400 }
    );
  }
}

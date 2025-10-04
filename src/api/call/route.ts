import { NextResponse } from "next/server";

type CallRequest = {
  to?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CallRequest;
    const to = body.to?.trim();

    if (!to) {
      return NextResponse.json(
        { sid: null, status: "missing-destination", error: "Destination phone required." },
        { status: 400 }
      );
    }

    return NextResponse.json({ sid: "demo-call", status: "queued", to });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body";
    return NextResponse.json(
      { sid: null, status: "invalid-request", error: message },
      { status: 400 }
    );
  }
}

"use client";

import { FormEvent, useState } from "react";

export default function Home() {
  const [request, setRequest] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!request.trim()) {
      setError("Please enter a request first.");
      setResponse(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);
    setCallStatus(null);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ natural: request }),
      });

      if (!res.ok) {
        throw new Error(`Gemini request failed (${res.status})`);
      }

      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));

      const slots = (data && typeof data === "object" ? data.slots : null) as Record<string, any> | null;
      const phone = slots?.phone ? String(slots.phone).trim() : "";

      if (phone) {
        setCallStatus("Dialing via Twilio…");
        try {
          const callRes = await fetch("/api/call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: phone }),
          });
          const callData = await callRes.json();

          if (!callRes.ok) {
            const reason = callData?.error || `Call failed (${callRes.status})`;
            setCallStatus(reason);
          } else {
            const sidMessage = callData?.sid ? `SID ${callData.sid}` : "";
            setCallStatus(sidMessage ? `Call queued to ${phone}. ${sidMessage}` : `Call queued to ${phone}.`);
          }
        } catch (twilioError) {
          const message =
            twilioError instanceof Error ? twilioError.message : "Unable to contact Twilio.";
          setCallStatus(message);
        }
      } else {
        setCallStatus("Gemini response missing a phone number; skipped Twilio call.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setCallStatus(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-t from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-end gap-6 px-4 pb-12">
        {response && (
          <pre className="max-h-64 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
            {response}
          </pre>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {callStatus && !error && <p className="text-sm text-slate-300">{callStatus}</p>}

        <form onSubmit={handleSubmit} className="mt-auto w-full">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
            <input
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="What do you need Gemini to plan?"
              className="flex-1 bg-transparent px-3 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

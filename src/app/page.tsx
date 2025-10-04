"use client";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

/** Utilities */
function normalizePhoneNumber(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  if (t === "911") return "911"; // UI intent — backend decides
  const hasPlus = t.startsWith("+");
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length < 10) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

type PlanResponse = {
  intent: string;                // short human summary Gemini proposes
  slots: Record<string, any>;    // extracted fields (editable)
  required: string[];            // which keys must be present before dialing
  ivr?: { sendDigits?: string[]; languagePref?: string; autoNavigate?: boolean };
  safety?: { emergency?: boolean; warn?: string | null };
};

export default function Home() {
  const [nl, setNl] = useState("");
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [manualSlots, setManualSlots] = useState<Record<string, any>>({});
  const [status, setStatus] = useState("");
  const [calling, setCalling] = useState(false);

  // Merge Gemini plan with manual edits
  const merged = useMemo(() => {
    const base = plan || {
      intent: "",
      slots: {},
      required: ["target", "phone"],
      ivr: { autoNavigate: true, sendDigits: [] as string[] },
      safety: { emergency: false, warn: null as string | null },
    };
    const slots = { ...base.slots, ...manualSlots };

    // normalize phone if user typed one
    if (slots.phone) {
      const n = normalizePhoneNumber(String(slots.phone));
      if (n) slots.phone = n;
    }

    // recompute missing from required
    const missing = (base.required || []).filter((k) => slots[k] == null || String(slots[k]).trim() === "");
    return { ...base, slots, missing };
  }, [plan, manualSlots]);

  async function planWithGemini() {
    if (!nl.trim()) {
      setStatus("Describe what you want the call to do.");
      return;
    }
    setPlanning(true);
    setStatus("");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ natural: nl }),
      });
      const data = (await res.json()) as PlanResponse;
      setPlan(data);
      // prefill manualSlots so user can tweak
      setManualSlots(data.slots || {});
    } catch (e) {
      console.error(e);
      setStatus("Planner error. Try rephrasing.");
    } finally {
      setPlanning(false);
    }
  }

  async function startCall() {
    if (!merged || merged.missing.length) return;
    setCalling(true);
    setStatus("Dialing…");
    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: merged.slots.phone,
          prebrief: {
            intent: merged.intent,
            slots: merged.slots,
            ivr: merged.ivr,
            safety: merged.safety,
            naturalInput: nl,
          },
        }),
      });
      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const data = isJson ? await res.json() : null;

      if (!res.ok) {
        const message = data?.error || `Call failed (${res.status})`;
        setStatus(message);
        return;
      }

      if (data?.sid) setStatus(`Call started (${data.status})`);
      else setStatus(data?.error || "Failed to start call");
    } catch (e) {
      console.error(e);
      setStatus("Error connecting to server");
    } finally {
      setCalling(false);
    }
  }

  // Small convenience: when NL changes, clear prior status
  useEffect(() => {
    setStatus("");
  }, [nl]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-slate-50 dark:from-black dark:to-neutral-900 px-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-4 mb-8 text-center">
        <Image src="/calltender.svg" alt="Calltender logo" width={80} height={80} className="dark:invert" />
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Calltender</h1>
        <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl">
          Type what you want the call to accomplish — Gemini will plan it, collect any missing details here,
          and the agent will handle the rest (voice, IVR menus, and follow-ups).
        </p>
      </div>

      {/* NL box */}
      <section className="w-full max-w-2xl">
        <label className="block text-left text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
          What should I handle?
        </label>
        <textarea
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          placeholder={`"Call Comcast, navigate to billing (press 2, then 1), ask to waive the $25 late fee. My account is REF 8KZ7. Leave callback +1 555 444 9999."`}
          rows={3}
          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-white/10 px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={planWithGemini}
            disabled={planning}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-3 transition disabled:opacity-50"
          >
            {planning ? "Planning…" : "Plan with Gemini"}
          </button>
          {status && <span className="text-sm text-gray-700 dark:text-gray-300">{status}</span>}
        </div>
      </section>

      {/* Planner panel */}
      {merged && (
        <section className="w-full max-w-2xl mt-6 grid gap-4">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Pre-call plan</h3>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  merged.safety?.emergency
                    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                    : merged.missing?.length
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                }`}
              >
                {merged.safety?.emergency
                  ? "Emergency"
                  : merged.missing?.length
                  ? `Missing: ${merged.missing.join(", ")}`
                  : "Ready"}
              </span>
            </div>

            {/* Intent (editable) */}
            <div className="mb-3">
              <label className="block text-sm text-gray-600 dark:text-gray-300">Intent summary</label>
              <input
                value={merged.intent || ""}
                onChange={(e) => setPlan((p) => (p ? { ...p, intent: e.target.value } : p))}
                placeholder="Short objective the agent will open with"
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-white/10 px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Editable slots */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(merged.slots || {}).map(([key, value]) => {
                // show structured IVR separately
                if (key === "ivr") return null;
                return (
                  <div key={key}>
                    <label className="block text-sm text-gray-600 dark:text-gray-300">
                      {key} {merged.missing?.includes(key) && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      value={value ?? ""}
                      onChange={(e) => setManualSlots((m) => ({ ...m, [key]: e.target.value }))}
                      placeholder={key === "phone" ? "+1 555 123 4567" : key}
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-white/10 px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                );
              })}

              {/* If Gemini didn’t include common slots, expose some helpful ones */}
              {!("phone" in (merged.slots || {})) && (
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300">phone *</label>
                  <input
                    value={manualSlots.phone ?? ""}
                    onChange={(e) =>
                      setManualSlots((m) => ({
                        ...m,
                        phone: normalizePhoneNumber(e.target.value) || e.target.value,
                      }))
                    }
                    placeholder="+1 555 123 4567"
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-white/10 px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}
              {!("target" in (merged.slots || {})) && (
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300">target *</label>
                  <input
                    value={manualSlots.target ?? ""}
                    onChange={(e) => setManualSlots((m) => ({ ...m, target: e.target.value }))}
                    placeholder="Comcast / Thai House / Dr. Kim / 911"
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-white/10 px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}
            </div>

            {/* IVR controls */}
            <div className="mt-4">
              <label className="block text-sm text-gray-600 dark:text-gray-300">Phone-tree navigation</label>
              <div className="mt-1 flex flex-col sm:flex-row gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={merged.ivr?.autoNavigate ?? true}
                    onChange={(e) =>
                      setManualSlots((m) => ({
                        ...m,
                        ivr: { ...(m.ivr || {}), autoNavigate: e.target.checked },
                      }))
                    }
                  />
                  Auto-navigate menus
                </label>
                <input
                  value={(merged.ivr?.sendDigits || []).join(",")}
                  onChange={(e) =>
                    setManualSlots((m) => ({
                      ...m,
                      ivr: {
                        ...(m.ivr || {}),
                        sendDigits: e.target.value
                          .split(/[^\d]/)
                          .map((x) => x.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                  placeholder="2,1,0"
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-white/10 px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <input
                  value={merged.ivr?.languagePref || ""}
                  onChange={(e) =>
                    setManualSlots((m) => ({
                      ...m,
                      ivr: { ...(m.ivr || {}), languagePref: e.target.value },
                    }))
                  }
                  placeholder="Language (e.g., English / Spanish)"
                  className="w-[220px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-white/10 px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Safety hint */}
            {merged.safety?.warn && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{merged.safety.warn}</p>
            )}

            {/* Actions */}
            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {merged.missing?.length ? (
                  <>Need <b>{merged.missing.join(", ")}</b> before calling.</>
                ) : (
                  <>All set. The agent will open with your intent and follow the plan.</>
                )}
              </div>
              <button
                onClick={startCall}
                disabled={!!merged.missing?.length || calling}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-3 transition disabled:opacity-50"
              >
                {calling ? "Calling…" : "Start Call"}
              </button>
            </div>
          </div>

          {/* Status */}
          {status && <p className="text-sm text-gray-700 dark:text-gray-300">{status}</p>}
        </section>
      )}
    </main>
  );
}

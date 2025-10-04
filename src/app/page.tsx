"use client";

import { FormEvent, useState } from "react";

type CallData = {
  intent: string;
  slots: Record<string, any>;
  required: string[];
  ivr?: any;
  safety?: any;
};

type MissingFieldPrompt = {
  field: string;
  label: string;
  placeholder: string;
  description: string;
};

export default function Home() {
  const [request, setRequest] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  
  // New state for handling missing fields
  const [callData, setCallData] = useState<CallData | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<MissingFieldPrompt | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const [collectedData, setCollectedData] = useState<Record<string, any>>({});

  // Helper function to get field prompt information
  const getFieldPrompt = (field: string, data: CallData): MissingFieldPrompt => {
    const prompts: Record<string, MissingFieldPrompt> = {
      phone: {
        field: "phone",
        label: "Phone Number",
        placeholder: "e.g., +1-555-123-4567 or 911",
        description: `To call ${data.slots.target || "this contact"}, please provide the phone number:`
      },
      target: {
        field: "target",
        label: "Who to Call",
        placeholder: "e.g., Pizza Palace, Dr. Smith, 911",
        description: "Who would you like to call?"
      },
      when: {
        field: "when",
        label: "When to Call",
        placeholder: "e.g., now, tomorrow 2pm, tonight",
        description: "When should this call be made?"
      },
      account: {
        field: "account",
        label: "Account Number",
        placeholder: "e.g., Account #12345",
        description: "Please provide your account number or reference:"
      },
      callback: {
        field: "callback",
        label: "Callback Number",
        placeholder: "e.g., +1-555-987-6543",
        description: "What number should they call you back at?"
      }
    };
    
    return prompts[field] || {
      field,
      label: field.charAt(0).toUpperCase() + field.slice(1),
      placeholder: `Please provide ${field}`,
      description: `Please provide the ${field}:`
    };
  };

  // Function to identify missing required fields
  const findMissingFields = (data: CallData): string[] => {
    const missing = [];
    for (const field of data.required || []) {
      const value = data.slots[field];
      if (!value || String(value).trim() === "") {
        missing.push(field);
      }
    }
    return missing;
  };

  // Function to handle field collection process
  const startFieldCollection = (data: CallData) => {
    const missing = findMissingFields(data);
    if (missing.length > 0) {
      setCallData(data);
      setMissingFields(missing);
      setCollectedData({});
      setCurrentPrompt(getFieldPrompt(missing[0], data));
      setCallStatus(null);
    } else {
      // All fields present, proceed with call
      makeCall(data);
    }
  };

  // Function to make the actual Twilio call
  const makeCall = async (data: CallData, additionalData: Record<string, any> = {}) => {
    setCallStatus("Dialing via Twilio…");
    
    // Merge original data with collected additional data
    const finalSlots = { ...data.slots, ...additionalData };
    const phone = finalSlots.phone || finalSlots.target;
    
    if (!phone) {
      setCallStatus("Error: Phone number still missing after data collection.");
      return;
    }

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
        const target = finalSlots.target ? ` to ${finalSlots.target}` : "";
        setCallStatus(sidMessage ? `Call queued${target} at ${phone}. ${sidMessage}` : `Call queued${target} at ${phone}.`);
        
        // Reset the collection state
        setCallData(null);
        setMissingFields([]);
        setCurrentPrompt(null);
        setCollectedData({});
      }
    } catch (twilioError) {
      const message = twilioError instanceof Error ? twilioError.message : "Unable to contact Twilio.";
      setCallStatus(message);
    }
  };

  // Handle field input submission
  const handleFieldSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (!currentPrompt || !promptInput.trim()) {
      setError("Please provide the required information.");
      return;
    }

    const updatedCollectedData = { ...collectedData, [currentPrompt.field]: promptInput.trim() };
    setCollectedData(updatedCollectedData);
    
    // Find next missing field
    const remainingFields = missingFields.filter(field => !(field in updatedCollectedData));
    
    if (remainingFields.length > 0) {
      // More fields needed
      setCurrentPrompt(getFieldPrompt(remainingFields[0], callData!));
      setPromptInput("");
    } else {
      // All fields collected, make the call
      setCurrentPrompt(null);
      setPromptInput("");
      await makeCall(callData!, updatedCollectedData);
    }
  };

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

      const data = await res.json() as CallData;
      setResponse(JSON.stringify(data, null, 2));

      // Start field collection process
      startFieldCollection(data);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setCallStatus(null);
    } finally {
      setLoading(false);
    }
  }

  // Function to cancel field collection and reset
  const cancelCollection = () => {
    setCallData(null);
    setMissingFields([]);
    setCurrentPrompt(null);
    setCollectedData({});
    setPromptInput("");
    setCallStatus("Collection cancelled. You can start a new request.");
  };

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

        {/* Progress indicator for field collection */}
        {currentPrompt && missingFields.length > 0 && (
          <div className="rounded-2xl border border-blue-800/50 bg-blue-900/20 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-blue-300">
                Step {missingFields.length - missingFields.filter(f => f in collectedData).length} of {missingFields.length}
              </span>
              <span className="text-xs text-slate-400">
                Collecting info for: {callData?.slots.target || "your call"}
              </span>
            </div>
            <div className="mb-3 h-2 rounded-full bg-slate-800">
              <div 
                className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                style={{ 
                  width: `${((missingFields.length - missingFields.filter(f => !(f in collectedData)).length) / missingFields.length) * 100}%` 
                }}
              />
            </div>
            {/* Show collected data so far */}
            {Object.keys(collectedData).length > 0 && (
              <div className="text-xs text-slate-400">
                <span className="text-green-400">✓</span> Already collected: {Object.keys(collectedData).join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Field collection form */}
        {currentPrompt ? (
          <form onSubmit={handleFieldSubmit} className="mt-auto w-full">
            <div className="mb-3 text-sm text-slate-300">
              {currentPrompt.description}
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-blue-800 bg-blue-900/30 p-2">
              <input
                value={promptInput}
                onChange={(event) => setPromptInput(event.target.value)}
                placeholder={currentPrompt.placeholder}
                className="flex-1 bg-transparent px-3 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={cancelCollection}
                className="rounded-xl bg-slate-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!promptInput.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </form>
        ) : (
          /* Main input form */
          <form onSubmit={handleSubmit} className="mt-auto w-full">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
              <input
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                placeholder="e.g., 'Call Pizza Palace at 555-123-4567' or 'Call 911'"
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
        )}
      </div>
    </main>
  );
}

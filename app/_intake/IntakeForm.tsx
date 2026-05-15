"use client";

import Link from "next/link";
import { useState } from "react";

const LAB_SIZES = ["1–10", "11–50", "51–200", "200+"];

type AccentKey = "teal" | "emerald";

const ACCENT: Record<AccentKey, {
  textHeader: string;
  button: string;
  buttonHover: string;
  ring: string;
}> = {
  teal: {
    textHeader: "text-teal-700",
    button: "bg-teal-600",
    buttonHover: "hover:bg-teal-700",
    ring: "focus:ring-teal-600",
  },
  emerald: {
    textHeader: "text-emerald-800",
    button: "bg-emerald-700",
    buttonHover: "hover:bg-emerald-800",
    ring: "focus:ring-emerald-700",
  },
};

interface IntakeFormProps {
  track: "clinical" | "environmental";
  accent: AccentKey;
  title: string;
  subtitle: string;
  accreditations: string[];
  showFieldBench: boolean;
}

export default function IntakeForm({
  track,
  accent,
  title,
  subtitle,
  accreditations,
  showFieldBench,
}: IntakeFormProps) {
  const a = ACCENT[accent];
  const [state, setState] = useState<{
    name: string;
    email: string;
    labName: string;
    labSize: string;
    accreditations: string[];
    painPoint: string;
    source: string;
    fieldBenchSplit: number;
  }>({
    name: "",
    email: "",
    labName: "",
    labSize: "",
    accreditations: [],
    painPoint: "",
    source: "",
    fieldBenchSplit: 50,
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  function toggleAcc(value: string) {
    setState((s) =>
      s.accreditations.includes(value)
        ? { ...s, accreditations: s.accreditations.filter((v) => v !== value) }
        : { ...s, accreditations: [...s.accreditations, value] }
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track,
          ...state,
          fieldBenchSplit: showFieldBench ? state.fieldBenchSplit : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatus("error");
        setErrorMsg(json.error || "Submission failed");
        return;
      }
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  }

  if (status === "ok") {
    return (
      <main className="min-h-screen bg-white text-slate-900">
        <header className="border-b border-slate-200">
          <div className="max-w-2xl mx-auto px-6 py-4">
            <Link href="/start" className="text-sm font-semibold">LIMS BOX</Link>
          </div>
        </header>
        <section className="max-w-2xl mx-auto px-6 py-24 text-center space-y-4">
          <h1 className="text-2xl font-semibold">Thanks.</h1>
          <p className="text-slate-700">HT will reply within 48 hours from hudtaylor@gmail.com.</p>
          <p className="text-xs text-slate-500">
            Each intake gets read personally. No marketing automation. No drip campaign.
          </p>
          <div className="pt-4">
            <Link href="/start" className="text-sm text-slate-600 hover:text-slate-900 underline">
              Back to start
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/start" className="text-sm font-semibold">LIMS BOX</Link>
          <Link href={`/${track}`} className="text-xs text-slate-600 hover:text-slate-900">
            Back to {track} overview
          </Link>
        </div>
      </header>

      <section className="max-w-2xl mx-auto px-6 py-12">
        <p className={`text-xs uppercase tracking-widest font-medium mb-2 ${a.textHeader}`}>
          {track === "clinical" ? "For clinical labs" : "For environmental labs"}
        </p>
        <h1 className="text-3xl font-semibold mb-2">{title}</h1>
        <p className="text-sm text-slate-600 mb-8">{subtitle}</p>

        <form onSubmit={onSubmit} className="space-y-5">
          <Field
            label="Your name"
            required
            value={state.name}
            onChange={(v) => setState({ ...state, name: v })}
            accentRing={a.ring}
          />
          <Field
            label="Email"
            type="email"
            required
            value={state.email}
            onChange={(v) => setState({ ...state, email: v })}
            accentRing={a.ring}
          />
          <Field
            label="Lab name"
            required
            value={state.labName}
            onChange={(v) => setState({ ...state, labName: v })}
            accentRing={a.ring}
          />

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1">Lab size</span>
            <div className="flex flex-wrap gap-2">
              {LAB_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setState({ ...state, labSize: s })}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    state.labSize === s
                      ? `${a.button} text-white border-transparent`
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1">Accreditations</span>
            <div className="flex flex-wrap gap-2">
              {accreditations.map((acc) => (
                <label
                  key={acc}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm cursor-pointer ${
                    state.accreditations.includes(acc)
                      ? `${a.button} text-white border-transparent`
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={state.accreditations.includes(acc)}
                    onChange={() => toggleAcc(acc)}
                  />
                  {acc}
                </label>
              ))}
            </div>
          </div>

          {showFieldBench && (
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">
                Field vs bench split: {state.fieldBenchSplit}% field / {100 - state.fieldBenchSplit}% bench
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={state.fieldBenchSplit}
                onChange={(e) => setState({ ...state, fieldBenchSplit: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          )}

          <Textarea
            label="Biggest documentation pain right now (optional)"
            value={state.painPoint}
            onChange={(v) => setState({ ...state, painPoint: v })}
            accentRing={a.ring}
          />
          <Textarea
            label="How did you hear about LIMS BOX? (optional)"
            value={state.source}
            onChange={(v) => setState({ ...state, source: v })}
            accentRing={a.ring}
            rows={2}
          />

          {status === "error" && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {errorMsg || "Something went wrong. Try again or email hudtaylor@gmail.com."}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={status === "submitting"}
              className={`inline-flex items-center rounded-md ${a.button} ${a.buttonHover} text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50`}
            >
              {status === "submitting" ? "Sending…" : "Send →"}
            </button>
          </div>

          <p className="text-xs text-slate-500 pt-2">
            We never share intake details. No automatic email send — HT reads each entry personally.
          </p>
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  type = "text",
  required = false,
  value,
  onChange,
  accentRing,
}: {
  label: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  accentRing: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${accentRing}`}
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows = 4,
  accentRing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  accentRing: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${accentRing}`}
      />
    </label>
  );
}

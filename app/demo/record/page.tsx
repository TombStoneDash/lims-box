'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical, ClipboardList, Shield, BarChart3, FileText,
  MessageSquare
} from 'lucide-react';

const STEP_DURATION = 30;
const TRANSITION_MS = 800;

interface RecordStep {
  id: string;
  title: string;
  overlay: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

/* ── Screen content (same data as walkthrough, minimal chrome) ────── */

function IntakeScreen() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Sample ID', 'WS-2026-0421'],
          ['Type', 'Drinking Water'],
          ['Client', 'Mesa County Water District'],
          ['Collection', 'Apr 14, 2026 — 09:15 AM'],
          ['Analysis', 'Nitrate (NO₃) — EPA 300.0'],
          ['Collector', 'Maria Gonzalez'],
        ].map(([l, v]) => (
          <div key={l} className="bg-white/5 border border-white/10 rounded-lg p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{l}</p>
            <p className="text-sm text-white">{v}</p>
          </div>
        ))}
      </div>
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
        <strong>Holding time:</strong> Nitrate — 48 hours. Countdown active. Preservation: Cool to 4°C.
      </div>
    </div>
  );
}

function AuditScreen() {
  const rows = [
    ['09:15:01', 'Sample Registered', 'M. Gonzalez'],
    ['09:15:02', 'COC Created', 'M. Gonzalez'],
    ['09:15:03', 'e-Signature: Collection', 'M. Gonzalez'],
    ['09:42:10', 'Sample Received', 'J. Simmons'],
    ['09:42:11', 'e-Signature: Receipt', 'J. Simmons'],
    ['09:42:15', 'Temp Verified: 4.1°C', 'J. Simmons'],
    ['10:05:33', 'Analysis Assigned', 'S. Chen'],
    ['10:38:22', 'Result: 4.2 mg/L', 'D. Park'],
    ['10:38:44', 'e-Signature: Analysis', 'D. Park'],
  ];
  return (
    <div className="space-y-1.5">
      {rows.map(([t, a, u], i) => (
        <div key={i} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 text-xs">
          <span className="font-mono text-slate-500 w-16">{t}</span>
          <span className="text-white">{a}</span>
          <span className="text-slate-500 ml-auto">{u}</span>
        </div>
      ))}
    </div>
  );
}

function QCScreen() {
  const data = [99.2, 101.5, 97.8, 103.1, 100.4, 98.7, 101.9, 99.5, 102.3, 100.1, 98.5, 101.2];
  const mean = 100; const sd = 3.5;
  const w = 600; const h = 160; const pad = 20;
  const max = mean + 3 * sd; const min = mean - 3 * sd; const range = max - min;
  const toX = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const toY = (v: number) => pad + ((max - v) / range) * (h - pad * 2);
  const d = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');
  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-white">Glucose — Levey-Jennings</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">100% in range</span>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
          <rect x={pad} y={toY(mean + 2 * sd)} width={w - pad * 2} height={toY(mean - 2 * sd) - toY(mean + 2 * sd)} fill="rgba(46,139,87,0.08)" />
          {[-2, 0, 2].map(m => <line key={m} x1={pad} y1={toY(mean + m * sd)} x2={w - pad} y2={toY(mean + m * sd)} stroke={m === 0 ? '#2E8B57' : '#334155'} strokeWidth={1} strokeDasharray={m !== 0 ? '4 4' : undefined} />)}
          <path d={d} fill="none" stroke="#3B82F6" strokeWidth={2} />
          {data.map((p, i) => <circle key={i} cx={toX(i)} cy={toY(p)} r={3.5} fill="#3B82F6" />)}
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {['MB: <MDL ✓', 'LCS: 97.2% ✓', 'RPD: 2.1% ✓', 'MS: 101.5% ✓'].map(qc => (
          <div key={qc} className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center text-[10px] text-green-300 font-medium">{qc}</div>
        ))}
      </div>
    </div>
  );
}

function ReportScreen() {
  return (
    <div className="space-y-3">
      <div className="bg-slate-800 rounded-lg p-4 border border-white/10">
        <div className="flex justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-white">Analytical Report — RPT-2026-0421</p>
            <p className="text-[10px] text-slate-400">Mesa County Water District — Nitrate</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 h-fit">FINAL</span>
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-xs">
          <div className="grid grid-cols-5 gap-2 text-slate-500 border-b border-white/5 pb-1 mb-1">
            <span>Sample</span><span>Analyte</span><span className="text-right">Result</span><span className="text-right">MCL</span><span>Status</span>
          </div>
          <div className="grid grid-cols-5 gap-2 text-slate-300">
            <span className="font-mono">WS-2026-0421</span><span>Nitrate (as N)</span>
            <span className="text-right font-mono font-medium text-white">4.2 mg/L</span>
            <span className="text-right text-slate-500">10 mg/L</span>
            <span className="text-green-400">Below MCL</span>
          </div>
        </div>
      </div>
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
        EPA-compliant report generated in <strong>12 seconds</strong>. All QC data auto-included.
      </div>
    </div>
  );
}

function BotScreen() {
  const msgs = [
    { role: 'user', text: 'What samples are pending verification?' },
    { role: 'bot', text: '3 samples pending:\n• WS-2026-0419 — Nitrate\n• WS-2026-0420 — Total Coliform\n• WS-2026-0421 — Nitrate' },
    { role: 'user', text: 'Show QC status for this week' },
    { role: 'bot', text: 'QC Summary (Apr 8–14):\n✓ 35 runs — 100% pass\n✓ 0 out-of-range\nAll analytes within ±2SD.' },
  ];
  return (
    <div className="space-y-2.5">
      {msgs.map((m, i) => (
        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
          <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs whitespace-pre-line ${
            m.role === 'user' ? 'bg-[#2E8B57] text-white rounded-br-sm' : 'bg-white/10 text-slate-200 rounded-bl-sm'
          }`}>{m.text}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Steps ──────────────────────────────────────────────────────────── */

const steps: RecordStep[] = [
  { id: 'intake', title: 'Sample Intake', overlay: 'Every sample. Tracked.', icon: ClipboardList, content: <IntakeScreen /> },
  { id: 'audit', title: 'Audit Trail', overlay: 'Every action. Logged.', icon: Shield, content: <AuditScreen /> },
  { id: 'qc', title: 'QC Dashboard', overlay: 'Enterprise-grade traceability.', icon: BarChart3, content: <QCScreen /> },
  { id: 'report', title: 'Reporting', overlay: 'Ready in minutes.', icon: FileText, content: <ReportScreen /> },
  { id: 'bot', title: 'LIMS BOT', overlay: 'Ask in plain English.', icon: MessageSquare, content: <BotScreen /> },
];

export default function RecordPage() {
  const [current, setCurrent] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [started, setStarted] = useState(false);

  const totalElapsed = current * STEP_DURATION + elapsed;
  const totalTime = steps.length * STEP_DURATION;

  const advance = useCallback(() => {
    if (current < steps.length - 1) {
      setTransitioning(true);
      setTimeout(() => {
        setCurrent(s => s + 1);
        setElapsed(0);
        setTransitioning(false);
      }, TRANSITION_MS);
    }
  }, [current]);

  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= STEP_DURATION) {
          advance();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [started, advance]);

  const step = steps[current];
  const StepIcon = step.icon;

  // Countdown splash before start
  if (!started) {
    return (
      <div className="h-screen bg-[#0F172A] flex items-center justify-center cursor-pointer" onClick={() => setStarted(true)}>
        <div className="text-center">
          <FlaskConical className="w-16 h-16 text-[#2E8B57] mx-auto mb-6" />
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">THE LIMS BOX</h1>
          <p className="text-slate-500 mb-8">Recording mode — click anywhere to start</p>
          <div className="text-xs text-slate-600">
            {steps.length} screens &times; {STEP_DURATION}s = {totalTime / 60}:{String(totalTime % 60).padStart(2, '0')} total
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0F172A] flex flex-col overflow-hidden">
      {/* Timer overlay — top-right, minimal */}
      <div className="absolute top-4 right-4 z-10 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-3 border border-white/10">
        <span className="text-xs text-slate-400">Setup</span>
        <span className="font-mono text-sm text-white">
          {Math.floor(totalElapsed / 60)}:{String(totalElapsed % 60).padStart(2, '0')}
        </span>
        <span className="text-xs text-slate-600">/</span>
        <span className="font-mono text-xs text-slate-500">
          {Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')}
        </span>
      </div>

      {/* Step indicator — top-left, minimal */}
      <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2 border border-white/10">
        <StepIcon className="w-3.5 h-3.5 text-[#2E8B57]" />
        <span className="text-xs text-white font-medium">{step.title}</span>
        <span className="text-[10px] text-slate-500">{current + 1}/{steps.length}</span>
      </div>

      {/* Progress bar — full width, very thin */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5 z-20">
        <div
          className="h-full bg-[#2E8B57] transition-all duration-1000 ease-linear"
          style={{ width: `${(totalElapsed / totalTime) * 100}%` }}
        />
      </div>

      {/* Main content area — centered, no chrome */}
      <div className={`flex-1 flex items-center justify-center px-8 transition-opacity duration-500 ${transitioning ? 'opacity-0' : 'opacity-100'}`}>
        <div className="w-full max-w-2xl">
          {/* Overlay text */}
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 tracking-tight text-center">
            {step.overlay}
          </h2>

          {/* Screen content */}
          <div className="bg-[#1E293B] border border-white/10 rounded-2xl p-6">
            {step.content}
          </div>
        </div>
      </div>

      {/* Branding — bottom center, subtle */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <span className="text-[10px] text-slate-700">THE LIMS BOX — lims.bot</span>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FlaskConical, ClipboardList, Shield, BarChart3, FileText,
  MessageSquare, ArrowRight, Pause, Play, ChevronRight
} from 'lucide-react';

const STEP_DURATION = 30; // seconds per step

interface WalkthroughStep {
  id: string;
  title: string;
  overlay: string;
  description: string;
  icon: React.ElementType;
  color: string;
  content: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Screen content for each of the 5 walkthrough steps                */
/* ------------------------------------------------------------------ */

function SampleIntakeScreen() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Sample ID', 'WS-2026-0421', true],
          ['Type', 'Drinking Water', false],
          ['Client', 'Mesa County Water District', false],
          ['Collection', 'Apr 14, 2026 — 09:15 AM', false],
          ['Analysis', 'Nitrate (NO₃) — EPA 300.0', false],
          ['Collector', 'Maria Gonzalez', false],
        ].map(([label, value, mono]) => (
          <div key={label as string} className="bg-white/5 border border-white/10 rounded-lg p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
            <p className={`text-sm text-white ${mono ? 'font-mono' : ''}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
        <p className="text-xs text-amber-300">
          <strong>Auto-detected:</strong> Nitrate — 48hr holding time. Countdown started. Preservation: 4°C.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-green-400">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        Sample WS-2026-0421 logged successfully
      </div>
    </div>
  );
}

function AuditTrailScreen() {
  const entries = [
    { time: '09:15:01', action: 'Sample Registered', user: 'M. Gonzalez', badge: 'bg-blue-500/20 text-blue-300' },
    { time: '09:15:02', action: 'COC Created', user: 'M. Gonzalez', badge: 'bg-purple-500/20 text-purple-300' },
    { time: '09:15:03', action: 'e-Signature: Collection', user: 'M. Gonzalez', badge: 'bg-violet-500/20 text-violet-300' },
    { time: '09:42:10', action: 'Sample Received', user: 'J. Simmons', badge: 'bg-blue-500/20 text-blue-300' },
    { time: '09:42:11', action: 'e-Signature: Receipt', user: 'J. Simmons', badge: 'bg-violet-500/20 text-violet-300' },
    { time: '09:42:15', action: 'Temp Verified: 4.1°C', user: 'J. Simmons', badge: 'bg-green-500/20 text-green-300' },
    { time: '10:05:33', action: 'Analysis Assigned', user: 'S. Chen', badge: 'bg-blue-500/20 text-blue-300' },
    { time: '10:38:22', action: 'Result: 4.2 mg/L', user: 'D. Park', badge: 'bg-green-500/20 text-green-300' },
    { time: '10:38:44', action: 'e-Signature: Analysis', user: 'D. Park', badge: 'bg-violet-500/20 text-violet-300' },
  ];
  return (
    <div className="space-y-1.5 max-h-[320px] overflow-hidden">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 text-xs">
          <span className="font-mono text-slate-500 w-16 flex-shrink-0">{e.time}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${e.badge}`}>{e.action}</span>
          <span className="text-slate-400 ml-auto">{e.user}</span>
        </div>
      ))}
      <div className="text-center text-[10px] text-slate-600 pt-1">
        9 entries — timestamps UTC — IP logged — tamper-evident
      </div>
    </div>
  );
}

function QCDashboardScreen() {
  const analytes = [
    { name: 'Glucose', mean: 100, sd: 3.5, points: [99.2, 101.5, 97.8, 103.1, 100.4, 98.7, 101.9, 99.5, 102.3, 100.1, 98.5, 101.2] },
    { name: 'HbA1c', mean: 5.7, sd: 0.2, points: [5.65, 5.72, 5.58, 5.81, 5.69, 5.74, 5.63, 5.77, 5.68, 5.71, 5.66, 5.73] },
  ];
  return (
    <div className="space-y-4">
      {analytes.map(a => {
        const min = a.mean - 3 * a.sd;
        const max = a.mean + 3 * a.sd;
        const range = max - min;
        const w = 440; const h = 100; const pad = 10;
        const pw = w - pad * 2; const ph = h - pad * 2;
        const toX = (i: number) => pad + (i / (a.points.length - 1)) * pw;
        const toY = (v: number) => pad + ((max - v) / range) * ph;
        const d = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');
        return (
          <div key={a.name} className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-white">{a.name}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">All in range</span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 100 }}>
              <rect x={pad} y={toY(a.mean + 2 * a.sd)} width={pw} height={toY(a.mean - 2 * a.sd) - toY(a.mean + 2 * a.sd)} fill="rgba(46,139,87,0.1)" />
              <line x1={pad} y1={toY(a.mean)} x2={w - pad} y2={toY(a.mean)} stroke="#2E8B57" strokeWidth={1} strokeDasharray="4 4" />
              <path d={d} fill="none" stroke="#3B82F6" strokeWidth={2} />
              {a.points.map((p, i) => <circle key={i} cx={toX(i)} cy={toY(p)} r={3} fill="#3B82F6" />)}
            </svg>
            <div className="flex gap-4 text-[10px] text-slate-500 mt-1">
              <span>Mean: {a.mean}</span><span>SD: {a.sd}</span><span>N: {a.points.length}</span>
            </div>
          </div>
        );
      })}
      <div className="grid grid-cols-4 gap-2">
        {['MB: <MDL', 'LCS: 97.2%', 'Dup RPD: 2.1%', 'MS: 101.5%'].map(qc => (
          <div key={qc} className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
            <span className="text-[10px] text-green-300 font-medium">{qc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportingScreen() {
  return (
    <div className="space-y-3">
      <div className="bg-slate-800 rounded-lg p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-white">Analytical Report — RPT-2026-0421</p>
            <p className="text-[10px] text-slate-400">Generated automatically from sample data</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">FINAL</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-white/10">
              <th className="text-left py-1">Sample</th><th className="text-left py-1">Analyte</th>
              <th className="text-right py-1">Result</th><th className="text-right py-1">MCL</th><th className="text-left py-1">Status</th>
            </tr>
          </thead>
          <tbody className="text-slate-300">
            <tr>
              <td className="py-1 font-mono">WS-2026-0421</td><td>Nitrate (as N)</td>
              <td className="text-right font-mono font-medium text-white">4.2 mg/L</td>
              <td className="text-right text-slate-500">10 mg/L</td>
              <td><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300">Below MCL</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
        <strong>Compliance:</strong> Result 4.2 mg/L &lt; 10 mg/L MCL. Analyzed within holding time. All QC passed. Report auto-generated — 0 manual formatting.
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div className="w-2 h-2 rounded-full bg-green-400" />
        Report ready in 12 seconds. Previous method: ~3 hours.
      </div>
    </div>
  );
}

function LimsBotScreen() {
  const messages = [
    { role: 'user', text: 'What samples are pending verification?' },
    { role: 'bot', text: '3 samples pending verification:\n• WS-2026-0419 — Nitrate (received Apr 12)\n• WS-2026-0420 — Total Coliform (received Apr 13)\n• WS-2026-0421 — Nitrate (received Apr 14)\nWould you like to review any of these?' },
    { role: 'user', text: 'Show QC status for this week' },
    { role: 'bot', text: 'QC Summary (Apr 8–14):\n✓ 35 QC runs — 100% pass rate\n✓ 0 out-of-range flags\n✓ Control lots: GL-2026-A1, CBC-2026-C2\nAll analytes trending within ±2SD.' },
  ];
  return (
    <div className="space-y-3 max-h-[340px] overflow-hidden">
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-line ${
            m.role === 'user'
              ? 'bg-[#2E8B57] text-white rounded-br-sm'
              : 'bg-white/10 text-slate-200 rounded-bl-sm'
          }`}>
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const walkthroughSteps: WalkthroughStep[] = [
  {
    id: 'intake',
    title: 'Sample Intake',
    overlay: 'Log a sample in seconds. Holding times start automatically.',
    description: 'Sample WS-2026-0421 is logged with auto-generated ID, EPA method lookup, and automatic holding time countdown. Zero manual calculation.',
    icon: ClipboardList,
    color: 'bg-blue-500',
    content: <SampleIntakeScreen />,
  },
  {
    id: 'audit',
    title: 'Audit Trail',
    overlay: 'Every action. Logged. Timestamped. Tamper-evident.',
    description: 'Complete chain of custody with electronic signatures, IP logging, and immutable timestamps. Built for ISO 17025 and 21 CFR Part 11.',
    icon: Shield,
    color: 'bg-purple-500',
    content: <AuditTrailScreen />,
  },
  {
    id: 'qc',
    title: 'QC Dashboard',
    overlay: 'QC trending in real time. Failures flagged before results go out.',
    description: 'Levey-Jennings charts, Westgard rules, and batch QC — all automated. Method blanks, LCS, duplicates, and matrix spikes tracked per batch.',
    icon: BarChart3,
    color: 'bg-green-500',
    content: <QCDashboardScreen />,
  },
  {
    id: 'reporting',
    title: 'Compliance Reporting',
    overlay: 'One-click reports. EPA-formatted. 3 hours → 12 seconds.',
    description: 'Results, QC summary, and regulatory limits auto-populated into client-ready reports. No copy-paste. No manual formatting.',
    icon: FileText,
    color: 'bg-amber-500',
    content: <ReportingScreen />,
  },
  {
    id: 'limsbot',
    title: 'LIMS BOT Query',
    overlay: 'Ask your LIMS in plain English.',
    description: 'Natural language queries against your lab data. Pending samples, QC status, turnaround metrics — answers in seconds, not spreadsheet sessions.',
    icon: MessageSquare,
    color: 'bg-teal-500',
    content: <LimsBotScreen />,
  },
];

export default function WalkthroughPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);

  const totalTime = walkthroughSteps.length * STEP_DURATION;
  const globalElapsed = currentStep * STEP_DURATION + elapsed;

  const advance = useCallback(() => {
    if (currentStep < walkthroughSteps.length - 1) {
      setCurrentStep(s => s + 1);
      setElapsed(0);
    } else {
      setPaused(true); // pause at end
    }
  }, [currentStep]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= STEP_DURATION) {
          advance();
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [paused, advance]);

  const step = walkthroughSteps[currentStep];
  const StepIcon = step.icon;
  const progressPct = ((elapsed + 1) / STEP_DURATION) * 100;

  const goTo = (idx: number) => { setCurrentStep(idx); setElapsed(0); };

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col">
      {/* Minimal header */}
      <header className="bg-black/40 border-b border-white/5 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-[#2E8B57]" />
            <span className="text-sm font-bold text-white">LIMS BOX</span>
            <span className="text-[10px] bg-[#2E8B57]/20 text-[#2E8B57] px-2 py-0.5 rounded-full ml-1">WALKTHROUGH</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 font-mono">
              {Math.floor(globalElapsed / 60)}:{String(globalElapsed % 60).padStart(2, '0')} / {Math.floor(totalTime / 60)}:{String(totalTime % 60).padStart(2, '0')}
            </span>
            <button
              onClick={() => setPaused(p => !p)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              {paused ? <Play className="w-3.5 h-3.5 ml-0.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Step indicators */}
      <div className="px-4 py-3 bg-black/20">
        <div className="max-w-5xl mx-auto flex gap-1">
          {walkthroughSteps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              className="flex-1 group"
            >
              <div className={`h-1 rounded-full overflow-hidden ${i < currentStep ? 'bg-[#2E8B57]' : i === currentStep ? 'bg-white/20' : 'bg-white/5'}`}>
                {i === currentStep && (
                  <div className="h-full bg-[#2E8B57] transition-all duration-1000 ease-linear" style={{ width: `${progressPct}%` }} />
                )}
              </div>
              <p className={`text-[10px] mt-1.5 text-center truncate ${i === currentStep ? 'text-white font-medium' : 'text-slate-600 group-hover:text-slate-400'}`}>
                {s.title}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-4 py-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6 h-full">
          {/* Left: overlay + description */}
          <div className="lg:col-span-2 flex flex-col justify-center">
            <div className={`w-10 h-10 rounded-xl ${step.color}/20 flex items-center justify-center mb-4`}>
              <StepIcon className={`w-5 h-5 ${step.color.replace('bg-', 'text-')}`} />
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
              Step {currentStep + 1} of {walkthroughSteps.length}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight">
              {step.overlay}
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              {step.description}
            </p>
            {currentStep < walkthroughSteps.length - 1 ? (
              <button
                onClick={() => { advance(); setElapsed(0); }}
                className="inline-flex items-center gap-2 text-sm text-[#2E8B57] hover:text-white transition-colors font-medium"
              >
                Next: {walkthroughSteps[currentStep + 1].title} <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <Link
                href="/early-adopter"
                className="inline-flex items-center gap-2 bg-[#2E8B57] hover:bg-[#2E8B57]/90 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
              >
                Apply for Early Access <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          {/* Right: screen content */}
          <div className="lg:col-span-3">
            <div className="bg-[#1E293B] border border-white/10 rounded-2xl overflow-hidden">
              {/* Fake window chrome */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0F172A] border-b border-white/5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                <span className="text-[10px] text-slate-600 ml-3 font-mono">lims.bot — {step.title}</span>
              </div>
              <div className="p-5 min-h-[400px]">
                {step.content}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 py-3 border-t border-white/5 text-center text-xs text-slate-600">
        Simulated data — LIMS BOX by Tombstone Dash LLC
      </footer>
    </div>
  );
}

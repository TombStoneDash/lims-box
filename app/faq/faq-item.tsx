'use client';

import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FAQ {
  question: string;
  answer: string;
  category: string;
}

export function FAQItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonId = useId();

  return (
    <div className="border-b border-black/5 dark:border-white/5">
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="w-full flex items-start justify-between py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lab-teal focus-visible:ring-offset-2 rounded-sm"
        >
          <span className="font-medium text-slate-900 dark:text-white pr-4 text-sm">{faq.question}</span>
          <ChevronDown
            aria-hidden="true"
            className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="pb-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
        >
          {faq.answer}
        </div>
      )}
    </div>
  );
}

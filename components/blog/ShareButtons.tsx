'use client';

import React, { useState } from 'react';
import { Check, Link as LinkIcon } from 'lucide-react';

interface ShareButtonsProps {
  title: string;
  url: string;
  description?: string;
}

export function buildShareLinks(title: string, url: string) {
  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(url);

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

  return { twitterUrl, linkedinUrl };
}

export async function copyShareLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    const previouslyFocused = document.activeElement;
    const textarea = document.createElement('textarea');
    try {
      textarea.value = url;
      textarea.style.cssText = 'position: fixed; top: 0; left: 0; opacity: 0; pointer-events: none;';
      document.body.appendChild(textarea);
      textarea.select();
      return document.execCommand('copy') === true;
    } catch {
      return false;
    } finally {
      try {
        textarea.remove();
      } catch {
        // Cleanup must not override the copy result.
      }
      try {
        if (
          previouslyFocused?.isConnected &&
          'focus' in previouslyFocused &&
          typeof previouslyFocused.focus === 'function'
        ) {
          previouslyFocused.focus({ preventScroll: true });
        }
      } catch {
        // Focus restoration is best effort and must preserve the copy result.
      }
    }
  }
}

export function ShareButtons({ title, url }: ShareButtonsProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copied = copyStatus === 'copied';
  const failureMessage = "Couldn't copy link. Try again.";
  const { twitterUrl, linkedinUrl } = buildShareLinks(title, url);

  const handleCopyLink = async () => {
    setCopyStatus('idle');
    const success = await copyShareLink(url);
    setCopyStatus(success ? 'copied' : 'failed');
    if (success) {
      setTimeout(() => setCopyStatus(status => status === 'copied' ? 'idle' : status), 2000);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-500 dark:text-slate-400">
        Share:
      </span>

      {/* Twitter/X */}
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-center w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 hover:bg-[#1DA1F2]/10 hover:text-[#1DA1F2] text-slate-500 dark:text-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-lab-teal focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        aria-label="Share on X (opens in a new tab)"
        title="Share on X (Twitter)"
      >
        <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      </a>

      {/* LinkedIn */}
      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-center w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 hover:bg-[#0A66C2]/10 hover:text-[#0A66C2] text-slate-500 dark:text-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-lab-teal focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        aria-label="Share on LinkedIn (opens in a new tab)"
        title="Share on LinkedIn"
      >
        <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      </a>

      {/* Copy Link */}
      <button
        type="button"
        aria-label={copied ? 'Link copied' : 'Copy link'}
        onClick={handleCopyLink}
        className={`group flex items-center justify-center w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 transition-all focus-visible:ring-2 focus-visible:ring-lab-teal focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
          copied
            ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
            : 'hover:bg-lab-teal/10 hover:text-lab-teal text-slate-500 dark:text-slate-400'
        }`}
        title={copied ? 'Copied!' : copyStatus === 'failed' ? failureMessage : 'Copy link'}
      >
        {copied ? (
          <Check aria-hidden="true" className="w-4 h-4" />
        ) : (
          <LinkIcon aria-hidden="true" className="w-4 h-4" />
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? 'Link copied' : copyStatus === 'failed' ? failureMessage : ''}
      </span>
    </div>
  );
}

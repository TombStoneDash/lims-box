'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';

type VideoSectionProps = {
  videoId: string;
  title?: string;
  posterSrc?: string;
  posterAlt?: string;
  className?: string;
};

export function VideoSection({
  videoId,
  title = 'LIMS BOX video',
  posterSrc,
  posterAlt = '',
  className = '',
}: VideoSectionProps) {
  const [activated, setActivated] = useState(false);
  const shouldFocusPlayer = useRef(false);
  const fallbackPoster = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <section className={`py-12 px-4 ${className}`}>
      <div className="max-w-4xl mx-auto">
        <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-black/5 dark:border-white/10 shadow-2xl shadow-black/20">
          {activated ? (
            <iframe
              ref={(player) => {
                if (player && shouldFocusPlayer.current) {
                  // Consume the handoff on mount, never on a later iframe load.
                  shouldFocusPlayer.current = false;
                  player.focus();
                }
              }}
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&color=white`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          ) : (
            <button
              type="button"
              onClick={(event) => {
                shouldFocusPlayer.current =
                  event.currentTarget.ownerDocument.activeElement === event.currentTarget;
                setActivated(true);
              }}
              aria-label={`Play video: ${title}`}
              className="absolute inset-0 w-full h-full group cursor-pointer"
            >
              <Image
                src={posterSrc || fallbackPoster}
                alt={posterAlt}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 896px"
                unoptimized={!posterSrc}
                priority={false}
              />
              <span className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex items-center justify-center w-20 h-20 rounded-full bg-[#2E8B57] shadow-lg shadow-[#2E8B57]/30 group-hover:scale-110 transition-transform">
                  <Play className="w-8 h-8 text-white ml-1" fill="currentColor" aria-hidden="true" />
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

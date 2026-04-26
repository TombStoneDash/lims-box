'use client';

import { useState } from 'react';
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
  title = 'THE LIMS BOX — 2:45 commercial',
  posterSrc,
  posterAlt = 'LIMS BOX commercial poster',
  className = '',
}: VideoSectionProps) {
  const [activated, setActivated] = useState(false);
  const fallbackPoster = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <section className={`py-12 px-4 ${className}`}>
      <div className="max-w-4xl mx-auto">
        <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-black/5 dark:border-white/10 shadow-2xl shadow-black/20">
          {activated ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&color=white`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setActivated(true)}
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
                  <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

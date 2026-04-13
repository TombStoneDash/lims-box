import Link from 'next/link';
import { Clock } from 'lucide-react';
import type { BlogPostMeta } from '@/lib/blog';

interface RelatedPostsProps {
  currentSlug: string;
  currentTags: string[];
  currentCategory: string;
  allPosts: BlogPostMeta[];
  maxPosts?: number;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function RelatedPosts({
  currentSlug,
  currentTags,
  currentCategory,
  allPosts,
  maxPosts = 3
}: RelatedPostsProps) {
  const scored = allPosts
    .filter(p => p.slug !== currentSlug)
    .map(post => {
      let score = 0;
      const sharedTags = post.tags.filter(t => currentTags.includes(t));
      score += sharedTags.length * 2;
      if (post.category === currentCategory) score += 1;
      const daysSince = (Date.now() - new Date(post.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) score += 0.5;
      return { ...post, score };
    })
    .sort((a, b) => b.score - a.score || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, maxPosts);

  if (scored.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-black/10 dark:border-white/10">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
        Related Posts
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {scored.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-4 hover:border-lab-teal/30 hover:shadow-md transition-all"
          >
            <span className="text-xs font-medium text-lab-teal uppercase tracking-wider">
              {post.category}
            </span>
            <h3 className="font-semibold text-slate-900 dark:text-white mt-1 mb-2 line-clamp-2 group-hover:text-lab-teal transition-colors text-lg">
              {post.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
              {post.description}
            </p>
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>{formatDate(post.publishedAt)}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {post.readingTime} min
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

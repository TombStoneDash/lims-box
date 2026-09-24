import Link from 'next/link';
import { Clock } from 'lucide-react';
import type { BlogPostMeta } from '@/lib/blog';
import { getRelatedPosts } from '@/lib/blog-related-posts';

interface RelatedPostsProps {
  currentSlug: string;
  currentTags: string[];
  currentCategory: string;
  allPosts: BlogPostMeta[];
  maxPosts?: number;
}

function formatDate(dateString: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateString)) return dateString;
  const date = new Date(`${dateString.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function RelatedPosts({
  currentSlug,
  currentTags,
  currentCategory,
  allPosts,
  maxPosts = 3
}: RelatedPostsProps) {
  const current = allPosts.find(p => p.slug === currentSlug)
    ?? { slug: currentSlug, tags: currentTags, category: currentCategory, publishedAt: '' } as BlogPostMeta;
  const related = getRelatedPosts(current, allPosts, maxPosts);

  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-posts-heading" className="mt-12 pt-8 border-t border-black/10 dark:border-white/10">
      <h2 id="related-posts-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
        Related Posts
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {related.map((post) => (
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
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
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

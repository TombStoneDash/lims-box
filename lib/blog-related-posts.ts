import type { BlogPostMeta } from './blog';

/** Rank by distinct shared tags plus a matching category, then newest publication. */
export function getRelatedPosts(
  current: BlogPostMeta,
  allPosts: BlogPostMeta[],
  limit: number,
): BlogPostMeta[] {
  if (!(limit > 0)) return [];

  const currentTags = new Set(current.tags);

  return allPosts
    .filter(post => post.slug !== current.slug)
    .map(post => ({
      post,
      score: [...new Set(post.tags)].filter(tag => currentTags.has(tag)).length
        + (post.category === current.category ? 1 : 0),
      publishedAt: Date.parse(post.publishedAt) || 0,
    }))
    .sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt)
    .slice(0, Math.floor(limit))
    .map(({ post }) => post);
}

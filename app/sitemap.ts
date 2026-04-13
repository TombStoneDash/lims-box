import { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://lims.bot'
  const lastModified = new Date()

  const staticPages = [
    { url: '', priority: 1.0, changeFrequency: 'weekly' as const },
    { url: '/pricing', priority: 0.9, changeFrequency: 'weekly' as const },
    { url: '/demo', priority: 0.9, changeFrequency: 'monthly' as const },
    { url: '/contact', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/blog', priority: 0.8, changeFrequency: 'daily' as const },
    { url: '/for/environmental-labs', priority: 0.9, changeFrequency: 'weekly' as const },
    { url: '/for/cannabis-labs', priority: 0.9, changeFrequency: 'weekly' as const },
    { url: '/case-study', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/roi-calculator', priority: 0.8, changeFrequency: 'monthly' as const },
  ]

  const blogPosts = getAllPosts().map((post) => ({
    url: `/blog/${post.slug}`,
    priority: post.featured ? 0.8 : 0.7,
    changeFrequency: 'weekly' as const,
    lastModified: new Date(post.updatedAt || post.publishedAt),
  }))

  return [
    ...staticPages.map((page) => ({
      url: `${baseUrl}${page.url}`,
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...blogPosts.map((post) => ({
      url: `${baseUrl}${post.url}`,
      lastModified: post.lastModified,
      changeFrequency: post.changeFrequency,
      priority: post.priority,
    })),
  ]
}

import { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://lims.bot'

  const staticPages = [
    { url: '', priority: 1.0, changeFrequency: 'weekly' as const },
    { url: '/blog', priority: 0.8, changeFrequency: 'daily' as const },
  ]

  const blogPosts = getAllPosts().map((post) => ({
    url: `/blog/${post.slug}`,
    priority: post.featured ? 0.8 : 0.7,
    changeFrequency: 'weekly' as const,
    lastModified: new Date(post.updatedAt || post.publishedAt),
  }))

  const lastModified = new Date()

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

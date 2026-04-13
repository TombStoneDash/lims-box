import Link from 'next/link';
import { ArrowLeft, FlaskConical, Clock, Calendar, ChevronRight, Tag } from 'lucide-react';
import { getAllPosts } from '@/lib/blog';
import { NewsletterSignup } from '@/components/blog/NewsletterSignup';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LIMS Blog — Small Lab Software, Environmental Testing & Lab Management Tips | LIMS BOX',
  description: 'Free guides for small environmental and water testing labs: choosing the right LIMS, streamlining sample tracking, meeting compliance without enterprise software.',
  openGraph: {
    title: 'LIMS Blog — Small Lab Software, Environmental Testing & Lab Management Tips',
    description: 'Free guides for small environmental and water testing labs: choosing the right LIMS, streamlining sample tracking, meeting compliance without enterprise software.',
    url: 'https://lims.bot/blog',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LIMS BOX Blog — Tips for Small Testing Labs',
    description: 'Practical advice on lab management, LIMS software, and running efficient environmental and water testing operations.',
  },
};

const blogBreadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://lims.bot',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Blog',
      item: 'https://lims.bot/blog',
    },
  ],
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogBreadcrumbJsonLd) }}
      />

      {/* Header */}
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center text-lab-teal hover:text-lab-blue transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Home
            </Link>

            <Link href="/" className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-lab-teal" />
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                LIMS BOX
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Gradient Bar */}
      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      {/* Hero Section */}
      <section className="py-12 md:py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            The LIMS BOX Blog
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Practical advice on lab management, LIMS software, and running efficient
            environmental and water testing operations.
          </p>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 dark:text-slate-400">
                No posts yet. Check back soon!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <article
                  key={post.slug}
                  className="bg-white dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 overflow-hidden hover:shadow-lg transition-all duration-300 group"
                >
                  <Link href={`/blog/${post.slug}`} className="block">
                    <div className="p-6 md:p-8">
                      {/* Category & Featured Badge */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-medium text-lab-teal uppercase tracking-wider">
                          {post.category}
                        </span>
                        {post.featured && (
                          <span className="text-xs font-medium bg-lab-teal/10 text-lab-teal px-2 py-0.5 rounded-full">
                            Featured
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3 group-hover:text-lab-teal transition-colors">
                        {post.title}
                      </h2>

                      {/* Description */}
                      <p className="text-slate-600 dark:text-slate-300 mb-4 line-clamp-2">
                        {post.description}
                      </p>

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(post.publishedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          <span>{post.readingTime} min read</span>
                        </div>
                        <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                        <span>By {post.author}</span>
                      </div>

                      {/* Tags */}
                      {post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                          {post.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="flex items-center gap-1 text-xs bg-black/5 dark:bg-white/10 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-md"
                            >
                              <Tag className="w-3 h-3" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Read More Arrow */}
                      <div className="flex items-center gap-1 text-lab-teal mt-4 font-medium group-hover:gap-2 transition-all">
                        Read more
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}

          {/* Newsletter Signup */}
          <NewsletterSignup />
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 px-4 bg-gradient-to-r from-lab-teal/10 to-lab-blue/10 dark:from-lab-teal/5 dark:to-lab-blue/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">
            Ready to simplify your lab?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            LIMS BOX is built for small environmental and water testing labs that need
            real tools — not enterprise contracts.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-blue text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Learn More
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-black/5 dark:border-white/5">
        <div className="max-w-4xl mx-auto text-center text-sm text-slate-500 dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} LIMS BOX by Tombstone Dash LLC.</p>
        </div>
      </footer>
    </div>
  );
}

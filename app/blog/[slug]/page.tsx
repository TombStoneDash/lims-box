import Link from 'next/link';
import { FlaskConical, Clock, Calendar, ChevronLeft, Tag } from 'lucide-react';
import { getPostBySlug, getAllSlugs, getAllPosts } from '@/lib/blog';
import { NewsletterSignup } from '@/components/blog/NewsletterSignup';
import { ShareButtons } from '@/components/blog/ShareButtons';
import { RelatedPosts } from '@/components/blog/RelatedPosts';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found | LIMS BOX Blog',
    };
  }

  return {
    title: `${post.title} | LIMS BOX Blog`,
    description: post.description,
    authors: [{ name: post.author }],
    keywords: post.tags,
    alternates: {
      canonical: `https://lims.bot/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [post.author],
      tags: post.tags,
      url: `https://lims.bot/blog/${post.slug}`,
      siteName: 'LIMS BOX',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const breadcrumbJsonLd = {
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
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `https://lims.bot/blog/${post.slug}`,
      },
    ],
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Person',
      name: post.author,
      jobTitle: post.authorRole,
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    publisher: {
      '@type': 'Organization',
      name: 'LIMS BOX',
      url: 'https://lims.bot',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://lims.bot/blog/${post.slug}`,
    },
    keywords: post.tags.join(', '),
    wordCount: post.content.replace(/<[^>]*>/g, '').split(/\s+/).length,
    articleSection: post.category,
    inLanguage: 'en-US',
    about: {
      '@type': 'Thing',
      name: 'Laboratory Information Management System',
      sameAs: 'https://en.wikipedia.org/wiki/Laboratory_information_management_system',
    },
    audience: {
      '@type': 'Audience',
      audienceType: 'Small environmental and water testing laboratories',
    },
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Header */}
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link
              href="/blog"
              className="flex items-center text-lab-teal hover:text-lab-blue transition-colors"
            >
              <ChevronLeft className="w-5 h-5 mr-1" />
              All Posts
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

      {/* Breadcrumbs */}
      <nav className="max-w-3xl mx-auto px-4 py-4">
        <ol className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <li>
            <Link href="/" className="hover:text-lab-teal transition-colors">Home</Link>
          </li>
          <li>/</li>
          <li>
            <Link href="/blog" className="hover:text-lab-teal transition-colors">Blog</Link>
          </li>
          <li>/</li>
          <li className="text-slate-900 dark:text-white truncate max-w-[200px]">{post.title}</li>
        </ol>
      </nav>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-4 pb-16">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-medium text-lab-teal uppercase tracking-wider">
              {post.category}
            </span>
            {post.featured && (
              <span className="text-xs font-medium bg-lab-teal/10 text-lab-teal px-2 py-0.5 rounded-full">
                Featured
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6 leading-tight tracking-tight">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400 pb-6 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>{post.readingTime} min read</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>By <strong className="text-slate-900 dark:text-white">{post.author}</strong></span>
              {post.authorRole && (
                <span className="text-slate-400 dark:text-slate-500">&bull; {post.authorRole}</span>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <div
          className="prose prose-lg max-w-none
            prose-headings:text-slate-900 dark:prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight
            prose-h2:text-2xl prose-h2:md:text-3xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:md:text-2xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-relaxed
            prose-strong:text-slate-900 dark:prose-strong:text-white prose-strong:font-semibold
            prose-a:text-lab-teal prose-a:no-underline hover:prose-a:underline
            prose-ul:text-slate-700 dark:prose-ul:text-slate-300
            prose-li:text-slate-700 dark:prose-li:text-slate-300
            prose-blockquote:border-l-lab-teal prose-blockquote:text-slate-600 dark:prose-blockquote:text-slate-400
            prose-code:bg-black/5 dark:prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal
            prose-pre:bg-black/5 dark:prose-pre:bg-white/5
            prose-hr:border-black/10 dark:prose-hr:border-white/10"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="mt-10 pt-6 border-t border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-sm bg-black/5 dark:bg-white/10 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Share Buttons */}
        <div className="mt-8">
          <ShareButtons
            title={post.title}
            url={`https://lims.bot/blog/${post.slug}`}
            description={post.description}
          />
        </div>

        {/* Related Posts */}
        <RelatedPosts
          currentSlug={post.slug}
          currentTags={post.tags}
          currentCategory={post.category}
          allPosts={getAllPosts()}
        />
      </article>

      {/* Newsletter Signup */}
      <div className="max-w-3xl mx-auto px-4">
        <NewsletterSignup />
      </div>

      {/* CTA Section */}
      <section className="py-12 px-4 bg-gradient-to-r from-lab-teal/10 to-lab-blue/10 dark:from-lab-teal/5 dark:to-lab-blue/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">
            Built for labs like yours
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            LIMS BOX gives small environmental and water testing labs the tools they
            actually need — without the enterprise overhead.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-blue text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Get Started
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-black/5 dark:border-white/5">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} LIMS BOX by Tombstone Dash LLC.</p>
          <Link href="/blog" className="text-lab-teal hover:text-lab-blue transition-colors">
            &larr; Back to all posts
          </Link>
        </div>
      </footer>
    </div>
  );
}

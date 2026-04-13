import fs from 'fs';
import path from 'path';

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  author: string;
  authorRole?: string;
  publishedAt: string;
  updatedAt?: string;
  category: string;
  tags: string[];
  image?: string;
  readingTime: number;
  featured?: boolean;
  content: string;
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  author: string;
  authorRole?: string;
  publishedAt: string;
  updatedAt?: string;
  category: string;
  tags: string[];
  image?: string;
  readingTime: number;
  featured?: boolean;
}

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

function parseFrontmatter(content: string): { meta: Record<string, unknown>; content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { meta: {}, content };
  }

  const frontmatter = match[1];
  const markdownContent = match[2];

  const meta: Record<string, unknown> = {};
  const lines = frontmatter.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();

    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      try {
        value = JSON.parse(value);
      } catch {
        // Keep as string if parsing fails
      }
    }

    if (typeof value === 'string' && !isNaN(Number(value)) && value !== '') {
      value = Number(value);
    }

    if (value === 'true') value = true;
    if (value === 'false') value = false;

    meta[key] = value;
  }

  return { meta, content: markdownContent };
}

function parseMarkdownToHtml(markdown: string): string {
  let html = markdown;

  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-lab-teal hover:text-lab-blue underline transition-colors">$1</a>');

  html = html.replace(/^---$/gm, '<hr class="my-8 border-t border-black/10 dark:border-white/10" />');

  html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul class="list-disc pl-6 space-y-2 my-4">${match}</ul>`);

  html = html.replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-lab-teal pl-4 italic my-4">$1</blockquote>');

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-x-auto my-4"><code>$2</code></pre>');

  html = html.replace(/`([^`]+)`/g, '<code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">$1</code>');

  html = html.split('\n\n').map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<')) return trimmed;
    return `<p class="my-4 leading-relaxed">${trimmed.replace(/\n/g, '<br />')}</p>`;
  }).join('\n');

  return html;
}

export function getAllPosts(): BlogPostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));

  const posts = files.map(filename => {
    const filePath = path.join(BLOG_DIR, filename);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { meta } = parseFrontmatter(fileContent);

    return {
      slug: (meta.slug as string) || filename.replace('.md', ''),
      title: (meta.title as string) || 'Untitled',
      description: (meta.description as string) || '',
      author: (meta.author as string) || 'LIMS BOX Team',
      authorRole: meta.authorRole as string | undefined,
      publishedAt: (meta.publishedAt as string) || new Date().toISOString().split('T')[0],
      updatedAt: meta.updatedAt as string | undefined,
      category: (meta.category as string) || 'General',
      tags: (meta.tags as string[]) || [],
      image: meta.image as string | undefined,
      readingTime: (meta.readingTime as number) || 5,
      featured: (meta.featured as boolean) || false,
    };
  });

  return posts.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getPostBySlug(slug: string): BlogPost | null {
  if (!fs.existsSync(BLOG_DIR)) {
    return null;
  }

  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));

  for (const filename of files) {
    const filePath = path.join(BLOG_DIR, filename);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { meta, content } = parseFrontmatter(fileContent);

    const postSlug = (meta.slug as string) || filename.replace('.md', '');

    if (postSlug === slug) {
      return {
        slug: postSlug,
        title: (meta.title as string) || 'Untitled',
        description: (meta.description as string) || '',
        author: (meta.author as string) || 'LIMS BOX Team',
        authorRole: meta.authorRole as string | undefined,
        publishedAt: (meta.publishedAt as string) || new Date().toISOString().split('T')[0],
        updatedAt: meta.updatedAt as string | undefined,
        category: (meta.category as string) || 'General',
        tags: (meta.tags as string[]) || [],
        image: meta.image as string | undefined,
        readingTime: (meta.readingTime as number) || 5,
        featured: (meta.featured as boolean) || false,
        content: parseMarkdownToHtml(content),
      };
    }
  }

  return null;
}

export function getAllSlugs(): string[] {
  return getAllPosts().map(post => post.slug);
}

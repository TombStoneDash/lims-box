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
  // Protect fenced code from every subsequent markdown and paragraph transform.
  const codeBlocks: string[] = [];
  let codeToken = 'BLOG_FENCED_CODE';
  while (markdown.includes(codeToken)) codeToken += '_';
  let html = markdown.replace(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm, (_, _fence, code: string) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const index = codeBlocks.push(`<pre class="bg-black/5 dark:bg-white/5 p-4 rounded-lg overflow-x-auto my-4"><code>${escaped}</code></pre>`) - 1;
    return `\n\n<${codeToken}${index}>\n\n`;
  });

  // Protect image attributes from later transforms, leaving inline code for its own pass.
  const images: string[] = [];
  let imageToken = 'BLOG_IMAGE';
  while (markdown.includes(imageToken)) imageToken += '_';
  const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const imageStart = /`[^`]+`|!\[([^\]\r\n]*)\]\(/g;
  const imageParts: string[] = [];
  let imageCopiedThrough = 0;
  let imageMatch: RegExpExecArray | null;
  while ((imageMatch = imageStart.exec(html)) !== null) {
    if (imageMatch[1] === undefined) continue;
    let depth = 1;
    let end = imageStart.lastIndex;
    let src = '';
    for (; end < html.length; end++) {
      const char = html[end];
      const next = html[end + 1];
      if (char === '\\' && (next === '(' || next === ')' || next === '\\')) {
        src += next;
        end++;
        continue;
      }
      // Do not borrow a closing delimiter from later prose, markup, or code.
      if (/\s/.test(char) || char === '[' || char === '`') break;
      if (char === '(') depth++;
      if (char === ')' && --depth === 0) break;
      src += char;
    }
    const valid = depth === 0 && src !== '';
    // Protect invalid openers too, so the link pass cannot turn them into anchors.
    const index = images.push(valid
      ? `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(imageMatch[1])}" class="max-w-full h-auto" />`
      : imageMatch[0]) - 1;
    imageParts.push(html.slice(imageCopiedThrough, imageMatch.index), `${imageToken}${index}END`);
    imageCopiedThrough = valid ? end + 1 : imageStart.lastIndex;
    imageStart.lastIndex = imageCopiedThrough;
  }
  html = imageParts.join('') + html.slice(imageCopiedThrough);

  // Use text placeholders so inline code remains part of its paragraph.
  const inlineCode: string[] = [];
  let inlineToken = 'BLOG_INLINE_CODE';
  while (markdown.includes(inlineToken)) inlineToken += '_';
  html = html.replace(/`([^`]+)`/g, (_, code: string) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const index = inlineCode.push(`<code class="bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-sm">${escaped}</code>`) - 1;
    return `${inlineToken}${index}END`;
  });

  // Keep link destinations out of prose transforms while labels remain formattable.
  const linkDestinations: string[] = [];
  let linkToken = 'BLOG_LINK_DESTINATION';
  while (markdown.includes(linkToken)) linkToken += '_';
  const linkStart = /\[([^\]]+)\]\(/g;
  const linkParts: string[] = [];
  let copiedThrough = 0;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkStart.exec(html)) !== null) {
    let depth = 1;
    let end = linkStart.lastIndex;
    let destination = '';
    for (; end < html.length; end++) {
      const char = html[end];
      const next = html[end + 1];
      // Escaped delimiters are URL characters, not nesting boundaries.
      if (char === '\\' && (next === '(' || next === ')' || next === '\\')) {
        destination += next;
        end++;
        continue;
      }
      if (char === '\n' || char === '\r') break;
      if (char === '(') depth++;
      if (char === ')' && --depth === 0) break;
      destination += char;
    }
    if (depth !== 0 || !destination) continue;
    const index = linkDestinations.push(destination) - 1;
    linkParts.push(html.slice(copiedThrough, linkMatch.index), `[${linkMatch[1]}](${linkToken}${index}END)`);
    copiedThrough = end + 1;
    linkStart.lastIndex = copiedThrough;
  }
  html = linkParts.join('') + html.slice(copiedThrough);

  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  html = html.replace(new RegExp(`\\[([^\\]]+)\\]\\((${linkToken}\\d+END)\\)`, 'g'), '<a href="$2" class="text-lab-teal hover:text-lab-blue underline transition-colors">$1</a>');

  html = html.replace(/^---$/gm, '<hr class="my-8 border-t border-black/10 dark:border-white/10" />');

  // Match whole runs by list type; blank lines and other blocks end each run.
  html = html.replace(/^\d+\.[ \t]+[^\n]*(?:\n\d+\.[ \t]+[^\n]*)*/gm, (list) => {
    const start = parseInt(list, 10);
    const items = list.split('\n').map(line => `<li>${line.replace(/^\d+\.[ \t]+/, '')}</li>`).join('\n');
    return `\n\n<ol class="list-decimal pl-6 space-y-2 my-4"${start === 1 ? '' : ` start="${start}"`}>${items}</ol>\n\n`;
  });
  html = html.replace(/^- [^\n]*(?:\n- [^\n]*)*/gm, (list) => {
    const items = list.split('\n').map(line => `<li>${line.slice(2)}</li>`).join('\n');
    return `\n\n<ul class="list-disc pl-6 space-y-2 my-4">${items}</ul>\n\n`;
  });

  html = html.replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-lab-teal pl-4 italic my-4">$1</blockquote>');

  // Inline tags still need paragraph spacing; fenced-code placeholders stand alone.
  const blockStart = new RegExp(`^<(?:h[1-6]|ul|ol|li|blockquote|hr|pre|div|table|p|img)(?:\\s|/?>)|^<${codeToken}\\d+>$`, 'i');
  html = html.split('\n\n').map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (blockStart.test(trimmed)) return trimmed;
    return `<p class="my-4 leading-relaxed">${trimmed.replace(/\n/g, '<br />')}</p>`;
  }).join('\n');

  html = html.replace(new RegExp(`${linkToken}(\\d+)END`, 'g'), (_, index) => escapeAttribute(linkDestinations[Number(index)]));
  html = html.replace(new RegExp(`${imageToken}(\\d+)END`, 'g'), (_, index) => images[Number(index)]);
  html = html.replace(new RegExp(`${inlineToken}(\\d+)END`, 'g'), (_, index) => inlineCode[Number(index)]);
  return html.replace(new RegExp(`<${codeToken}(\\d+)>`, 'g'), (_, index) => codeBlocks[Number(index)]);
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

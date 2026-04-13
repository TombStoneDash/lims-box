import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog | LIMS BOX — Lab Management Insights for Small Testing Labs',
  description: 'Practical guides on lab management, LIMS software, environmental testing workflows, and running a small lab efficiently. Written for labs under 50 people.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'Blog | LIMS BOX — Lab Management Insights for Small Testing Labs',
    description: 'Practical guides on lab management, LIMS software, environmental testing workflows, and running a small lab efficiently.',
    url: 'https://lims.bot/blog',
  },
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

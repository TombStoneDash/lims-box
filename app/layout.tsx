import type { Metadata } from 'next'
import type { Viewport } from 'next'
import { SKIP_LINK_LABEL, SKIP_LINK_TARGET_ID } from '@/lib/skip-link'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://lims.bot'),
  alternates: {
    canonical: '/',
  },
  title: 'LIMS BOX — Simple Lab Management for Small Testing Labs',
  description: 'Modern LIMS built for environmental and water testing labs under 50 people. Sample tracking, COC management, and reporting without the enterprise bloat.',
  keywords: ['LIMS', 'laboratory information management system', 'small lab LIMS', 'environmental lab software', 'water testing LIMS', 'affordable LIMS', 'lab management', 'sample tracking', 'COC management'],
  authors: [{ name: 'TombStoneDash' }],
  openGraph: {
    title: 'LIMS BOX — Simple Lab Management for Small Testing Labs',
    description: 'Modern LIMS built for environmental and water testing labs under 50 people. Sample tracking, COC management, and reporting without the enterprise bloat.',
    url: 'https://lims.bot',
    siteName: 'LIMS BOX',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: 'https://lims.bot/og-default.png',
        width: 1200,
        height: 630,
        alt: 'LIMS BOX — Lab Management for Small Testing Labs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LIMS BOX — Simple Lab Management for Small Testing Labs',
    description: 'Modern LIMS built for environmental and water testing labs under 50 people. No enterprise bloat.',
    images: ['https://lims.bot/og-default.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": "LIMS BOX",
                "url": "https://lims.bot",
                "description": "Modern laboratory information management system built for small environmental and water testing labs.",
                "founder": {
                  "@type": "Organization",
                  "name": "Tombstone Dash LLC"
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "LIMS BOX",
                "applicationCategory": "BusinessApplication",
                "operatingSystem": "Web",
                "description": "Simple, modern LIMS for small environmental and water testing labs. Sample tracking, chain of custody, reporting, and compliance without the enterprise price tag.",
                "url": "https://lims.bot",
                "author": {
                  "@type": "Organization",
                  "name": "Tombstone Dash LLC"
                },
                "featureList": [
                  "Sample tracking and chain of custody",
                  "Environmental and water testing workflows",
                  "Automated reporting and compliance",
                  "Quality assurance and quality control",
                  "Client portal and result delivery",
                  "Built for labs under 50 people"
                ]
              }
            ])
          }}
        />
      </head>
      <body className="theme-background overflow-x-hidden">
        <a
          href={`#${SKIP_LINK_TARGET_ID}`}
          className="sr-only focus:not-sr-only focus:fixed top-4 left-4 z-[9999] rounded bg-white px-4 py-3 text-black focus:ring-2 focus:ring-blue-700 focus:ring-offset-2"
        >
          {SKIP_LINK_LABEL}
        </a>
        <main id={SKIP_LINK_TARGET_ID} tabIndex={-1} className="outline-none">
          {children}
        </main>
      </body>
    </html>
  )
}

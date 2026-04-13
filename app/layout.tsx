import type { Metadata } from 'next'
import type { Viewport } from 'next'
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
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LIMS BOX — Simple Lab Management for Small Testing Labs',
    description: 'Modern LIMS built for environmental and water testing labs under 50 people. No enterprise bloat.',
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
                  "Instrument integration",
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
        <main id="main-content">
          {children}
        </main>
      </body>
    </html>
  )
}

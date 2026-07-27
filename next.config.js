// Every non-canonical host serving this app 308s to https://lims.bot.
// Both Vercel projects (lims-box and legacy limsbot) build this repo, so
// these rules cover the legacy domains without any dashboard change. The
// equivalent vercel.json redirect is ignored on Next.js deployments —
// host redirects must live here (issue #70).
const NON_CANONICAL_HOSTS = [
  'www.lims.bot',
  'limsbot.com',
  'www.limsbot.com',
  'limsbox.com',
  'www.limsbox.com',
  'thelimsbox.com',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdfkit'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
  async redirects() {
    return [
      ...NON_CANONICAL_HOSTS.map((host) => ({
        source: '/:path*',
        has: [{ type: 'host', value: host }],
        destination: 'https://lims.bot/:path*',
        permanent: true,
      })),
      {
        source: '/blog/clia-tracker',
        destination: '/blog/clia-tracker-three-times-with-ai',
        permanent: true,
      },
      {
        source: '/survey-export',
        destination: '/survey-ready-export',
        permanent: true,
      },
      {
        source: '/early-access',
        destination: '/early-adopter',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;

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

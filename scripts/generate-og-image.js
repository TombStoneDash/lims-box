#!/usr/bin/env node
/**
 * generate-og-image.js
 * Generates public/og-default.png for LIMS BOX (1200×630 OG spec)
 * Uses sharp + SVG compositing — no AI text in prompts (AGENTS.md Rule 7)
 *
 * Usage: node scripts/generate-og-image.js
 */

const sharp = require('sharp');
const path = require('path');

const WIDTH = 1200;
const HEIGHT = 630;

const LOGO_PATH = path.join(__dirname, '../public/logo-badge.jpg');
const OUTPUT_PATH = path.join(__dirname, '../public/og-default.png');

async function generateOgImage() {
  console.log('Generating og-default.png…');

  // Background: dark gradient matching globals.css dark theme
  const bgSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#0F172A"/>
      <stop offset="55%"  stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <!-- Soft glow circles for depth -->
  <circle cx="950" cy="80"  r="220" fill="#1E40AF" fill-opacity="0.12"/>
  <circle cx="1150" cy="520" r="160" fill="#0D9488" fill-opacity="0.10"/>
  <circle cx="600"  cy="600" r="100" fill="#1E40AF" fill-opacity="0.06"/>
</svg>`;

  // Text overlay: wordmark + tagline (rendered as SVG so fonts are system-safe)
  const textSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <!-- Teal accent bar left of wordmark -->
  <rect x="80" y="228" width="5" height="84" fill="#0D9488" rx="2.5"/>

  <!-- "LIMS BOX" wordmark -->
  <text
    x="100" y="285"
    font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-size="80" font-weight="800" fill="#F8FAFC" letter-spacing="-2">LIMS BOX</text>

  <!-- Tagline -->
  <text
    x="100" y="335"
    font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-size="24" font-weight="400" fill="#94A3B8">The LIMS that doesn't need an IT department.</text>

  <!-- Divider line -->
  <line x1="80" y1="495" x2="560" y2="495" stroke="#334155" stroke-width="1"/>

  <!-- Domain badge -->
  <text
    x="80" y="530"
    font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-size="18" font-weight="600" fill="#0D9488" letter-spacing="0.5">limsbox.io</text>

  <!-- Built on SENAITE subtle note -->
  <text
    x="80" y="560"
    font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-size="14" font-weight="400" fill="#475569">Built on SENAITE · ISO 15189 · CLIA ready</text>
</svg>`;

  // Resize logo to fit right side panel (max 520 wide, centered vertically)
  const logoResized = await sharp(LOGO_PATH)
    .resize(500, null, { fit: 'inside' })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Get actual logo height after resize so we can center it
  const logoMeta = await sharp(logoResized).metadata();
  const logoTop = Math.round((HEIGHT - logoMeta.height) / 2);
  const logoLeft = 640;

  await sharp(Buffer.from(bgSvg))
    .composite([
      // Logo (right panel, centered vertically)
      {
        input: logoResized,
        top: logoTop,
        left: logoLeft,
        blend: 'over',
      },
      // Light vignette over logo so text area stays legible
      {
        input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="vignette" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"  stop-color="#0F172A" stop-opacity="1"/>
              <stop offset="45%" stop-color="#0F172A" stop-opacity="0.3"/>
              <stop offset="70%" stop-color="#0F172A" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette)"/>
        </svg>`),
        top: 0,
        left: 0,
        blend: 'over',
      },
      // Text layer (on top of everything)
      {
        input: Buffer.from(textSvg),
        top: 0,
        left: 0,
        blend: 'over',
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT_PATH);

  const meta = await sharp(OUTPUT_PATH).metadata();
  console.log(`✅ Generated: ${OUTPUT_PATH}`);
  console.log(`   Dimensions: ${meta.width}×${meta.height} px`);
  console.log(`   Format: ${meta.format}`);
}

generateOgImage().catch((err) => {
  console.error('❌ Generation failed:', err.message);
  process.exit(1);
});

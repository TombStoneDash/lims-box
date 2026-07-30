# LIMS BOX

Enterprise Laboratory Information Management System (LIMS) launch platform. Conversion-optimized lead capture, compliance documentation, and personnel asset delivery.

**Live:** https://lims.bot

## Features

- 🧬 **Industry-specific landing** — Laboratory workflows, compliance, regulatory context
- 📧 **Lead capture** — Waitlist + early-adopter applications with Supabase persistence
- 📄 **Personnel pack** — Email-gated PDF download (lead magnet + qualification)
- 🔐 **Compliance docs** — Evidence page, audit matrix, regulatory mapping
- 📊 **Bot assistant** — Telemetry-tracked help widget with fallback email
- 🌐 **Public-ready** — SEO, social meta, accessibility (WCAG), mobile-responsive
- ⚙️ **Vercel-deployed** — Auto-deploy on push, preview deployments, edge functions

## Quick Start

### Prerequisites
- Node.js 18+
- npm/pnpm
- Vercel CLI (for local env vars)

### Local Development

```bash
# Clone and install
git clone https://github.com/tombstonedash/lims-box.git
cd lims-box
npm install

# Pull environment from Vercel (requires auth)
vercel env pull

# Start dev server
npm run dev
```

Open http://localhost:3000 in your browser.

### Environment Setup

**Required for production** (see `SUPABASE_SETUP.md` for details):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RESEND_API_KEY=re_xxxx...
NOTIFY_EMAIL=hudtaylor@gmail.com
NOTIFY_FROM_EMAIL=LIMS BOX <notifications@lims.bot>
```

**Local development:** Missing vars log gracefully; routes still return 200 so the UI doesn't break.

## Project Structure

```
lims-box/
├── app/                 # Next.js App Router
│   ├── api/            # API routes (form handlers, email, downloads)
│   ├── routes/         # Page routes (/, /about, /early-adopter, etc.)
│   └── layout.tsx      # Root layout, navigation, footer
├── components/         # Reusable React components
├── lib/                # Utilities (Supabase client, email validation, etc.)
├── public/             # Static assets (favicon, fonts, images)
├── content/            # Blog posts, compliance docs (markdown)
├── prisma/             # Data schemas (if using Prisma ORM)
└── next.config.js      # Next.js configuration
```

## Key Routes

| Route | Purpose |
|-------|---------|
| `/` | Hero + waitlist form |
| `/about` | Product overview, use cases |
| `/early-adopter` | Early-access application (qualified leads) |
| `/personnel-pack` | Email-gated PDF download |
| `/compliance` | Regulatory evidence page |
| `/blog` | Content hub |
| `/press` | Press kit + announcements |
| `/partners` | Partner program info |
| `/webinar` | Webinar signup + replay |
| `/cola` | Custom LMS application form (COLA 2027) |

## API Routes

### Form Handlers
- `POST /api/waitlist` — Persist to Supabase, send notification email
- `POST /api/early-access` — Application submission + qualification
- `POST /api/newsletter` — Newsletter signup (GDPR-safe)
- `POST /api/prospects` — Prospect enrichment intake

### Lead Capture
- `POST /api/personnel-pack-download` — Email-gated PDF release
- `GET /api/personnel-pack-download?token=...` — Verification link click

### System
- `POST /api/unsubscribe` — Persist opt-out, update Supabase sensors
- `POST /api/contact` — General contact form

All routes support **email fallback** (Resend domain unverified scenario) via `app/api/send-via-fallback`.

## Deployment

### Vercel (Production)

```bash
# Push to main branch triggers auto-deploy
git push origin main

# Or manual deploy
vercel --prod
```

Environment vars are pulled from Vercel project settings. Verify with:
```bash
vercel env list
```

### Preview Deployments

Every PR auto-deploys to a preview URL. Check status:
```bash
vercel ls
```

## Testing

### Local Test Email Flow

```bash
# Start dev server
npm run dev

# Visit http://localhost:3000
# Fill waitlist form
# Check console logs for Supabase + Resend output
# Verify email received (if RESEND_API_KEY set)
```

### Smoke Tests

Production health checks:
```bash
curl https://lims.bot/api/health
curl https://lims.bot/sitemap.xml
curl https://lims.bot/og-image.png
```

## Compliance & Legal

- **Privacy:** GDPR-compliant opt-in, unsubscribe persistence
- **Terms:** Legal footer links to `/terms` (see `content/`)
- **Accessibility:** WCAG 2.1 AA (form labels, semantic HTML, contrast)
- **Security:** No hardcoded secrets; all env vars via Vercel

See `/compliance` page for audit matrix and regulatory mapping.

## Troubleshooting

### Form submissions not persisting
- Check `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
- Verify Supabase tables exist (run SQL in `SUPABASE_SETUP.md`)
- Check RLS policies allow service-role inserts

### Email not sending
- Check `RESEND_API_KEY` is set and valid
- Verify domain is verified in Resend (send from notifications@lims.bot)
- Check spam folder; Resend may require DKIM/SPF setup

### Routes not rendering
- Restart dev server: `npm run dev`
- Clear `.next` cache: `rm -rf .next && npm run dev`
- Check Next.js build errors: `npm run build`

## Contributing

1. Create feature branch: `git checkout -b feat/thing`
2. Make changes, commit: `git commit -m "feat(module): description"`
3. Push and create PR: `git push origin feat/thing`
4. CI runs tests; preview deploys; HT reviews + merges
5. Merge triggers production deploy

## Metrics & Monitoring

**Vercel Analytics:**
- Dashboard: https://vercel.com/projects/lims-box
- Real User Monitoring (Core Web Vitals)
- Deployment history + rollback

**Form Conversion:**
- Supabase → check `waitlist` and `early_access_applications` tables
- Resend → check email delivery logs
- HubSpot/CRM → depends on integration (see project board)

## Resources

- 📖 **Supabase Setup:** [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- 📋 **Deployment:** [Vercel Dashboard](https://vercel.com/projects/lims-box)
- 📚 **Docs:** Next.js, Supabase, Resend (links in package.json)
- 🐛 **Issues:** GitHub [TombstoneDash/lims-box](https://github.com/tombstonedash/lims-box/issues)

## License

Private. See `LICENSE` file.

---

**Owner:** Hudson Taylor (HT)  
**Status:** Production (Live as of 2026-07-28)  
**Last Updated:** 2026-07-30

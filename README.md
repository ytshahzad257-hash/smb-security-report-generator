# SMB Security Report Generator

Professional SaaS web app foundation for generating automated website security posture reports for small businesses, agencies, freelancers, ecommerce stores, and software houses.

## Phase 1 Scope

This phase implements the project setup and responsive UI foundation only.

Included:

- Next.js App Router with TypeScript
- Tailwind CSS design tokens
- shadcn/ui-compatible component structure
- Reusable UI primitives and SaaS layout components
- Public pages for home, pricing, sample report, login, and signup
- Dashboard layout with sidebar, topbar, mobile drawer, breadcrumbs, and empty states
- `.env.example` and package scripts

Not included yet:

- Scanner checks
- PDF generation
- Stripe or manual payment logic

## Product Boundary

This product is a website security posture report generator. It is not a penetration testing tool, exploit scanner, brute-force tool, port scanner, or vulnerability exploitation system.

Allowed future scan categories include safe website URL checks, HTTP security headers, basic HTTPS/TLS posture, SPF/DMARC/MX/basic DKIM selectors, basic technology detection, limited safe exposed path checks, OWASP-aligned checklist mapping, risk scoring, and PDF report generation.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Setup

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Set `DATABASE_URL` in `.env.local` to a PostgreSQL connection string:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/smb_security_report_generator?schema=public"
```

Set `REDIS_URL` for local scan queue development:

```bash
REDIS_URL="redis://localhost:6379"
```

Redis can run locally, in Docker, or through a hosted Redis provider. For Docker:

```bash
docker run --name smb-redis -p 6379:6379 -d redis:7
```

Optional Stripe card payments:

```bash
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

Stripe is optional for local development. If these keys are missing, the billing
page keeps manual payment available and shows card payment as unavailable.

For local Stripe webhook testing, install the Stripe CLI and forward events:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use Stripe test card `4242 4242 4242 4242` and confirm that webhook delivery
updates the user subscription or report credits. The success redirect only shows
that Stripe received the payment; access changes happen from verified webhooks.

Lemon Squeezy card payments are integrated as the international card payment
foundation, but remain disabled until the store is activated and all required
environment variables are configured:

```bash
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_BASIC_REPORT_VARIANT_ID=
LEMONSQUEEZY_PRO_REPORT_VARIANT_ID=
LEMONSQUEEZY_AGENCY_STARTER_VARIANT_ID=
LEMONSQUEEZY_AGENCY_PRO_VARIANT_ID=
LEMONSQUEEZY_MANUAL_REVIEW_VARIANT_ID=
LEMONSQUEEZY_5_CREDITS_VARIANT_ID=
LEMONSQUEEZY_10_CREDITS_VARIANT_ID=
LEMONSQUEEZY_25_CREDITS_VARIANT_ID=
```

Website deployment and Lemon Squeezy store activation are required before live
card payments can be enabled. Manual payment remains active while Lemon Squeezy
is unavailable. Stripe code is retained for future optional use.

Lemon Squeezy success redirects return to `/dashboard/billing?lemon=success`,
but plan access and credits are only applied after a verified
`/api/lemon/webhook` event.

Run the development server in one terminal:

```bash
npm run dev
```

Run the scan worker in a second terminal:

```bash
npm run worker:scan
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio
npm run worker:scan
```

## Phase 6 Scan Queue

Phase 6 adds BullMQ queue plumbing for safe placeholder scan processing.

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run worker:scan
```

The worker consumes the `website-scan` queue, revalidates the target URL, writes scan logs, moves scans through `PENDING`, `RUNNING`, `COMPLETED`, and `FAILED`, and leaves score, grade, findings, and scanner-specific checks empty for later phases.

## Prisma

Generate the Prisma client:

```bash
npm run prisma:generate
```

Create and apply a PostgreSQL migration:

```bash
npm run prisma:migrate
```

Seed the default plans:

```bash
npm run prisma:seed
```

Open Prisma Studio:

```bash
npm run prisma:studio
```

## Phase 1 Routes

- `/`
- `/pricing`
- `/sample-report`
- `/login`
- `/signup`
- `/dashboard`

## UI Components

Reusable components live in `src/components/ui`, including Button, Card, Badge, Input, Textarea, Select, Dialog, Alert, Skeleton, Empty State, Page Header, Section Heading, Stat Card, and Data Table Shell.

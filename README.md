# Roamly

Roamly is an AI-powered travel planning MVP built with Next.js, TypeScript, Tailwind CSS, Prisma, Supabase, and Google Gemini.

## Gemini Setup

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with a Google account.
3. Create an API key.
4. Copy `.env.example` to `.env.local`.
5. Set the required Gemini values:

```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
AI_PROVIDER="gemini"
```

Keep `GEMINI_API_KEY` server-side only. Do not expose it with a `NEXT_PUBLIC_` prefix.

## Required Environment Variables

Roamly also requires Supabase and Prisma connection variables:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

See `.env.example` for the full template.

## Run Locally

```bash
npm install
npm run db:generate
npm run dev
```

Then open `http://localhost:3000`.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Prisma Changes

No Prisma schema changes are required for the Gemini migration.
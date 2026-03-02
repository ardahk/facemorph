# Skin Tone Morph Research Tool

Next.js app for generating skin-tone-modified portraits and morph transitions between original and modified images.

## What it includes

- Passcode-gated research UI
- Gemini-powered skin tone modification API route
- Two morph engines:
  - `facemorph.me API`
  - `Local (Cross-Dissolve)`
- Morph slider/video preview and downloads
- Basic server-side rate limiting

## Tech stack

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create local env file:
   ```bash
   cp .env.example .env.local
   ```
3. Fill required values in `.env.local`:
   - `GEMINI_API_KEY`
   - `ACCESS_PASSCODE`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
4. Run dev server:
   ```bash
   npm run dev
   ```

## Global quota behavior

To enforce a universal quota across all users and all deployed instances, configure Vercel KV (Upstash) and set:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

The app enforces global limits of:

- 30 requests per hour
- 50 requests per day

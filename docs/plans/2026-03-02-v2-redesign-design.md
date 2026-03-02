# Skin Tone Morph Research Tool v2 — Design Document

## Summary of Changes

Five major changes from v1:

1. **Replace local morph engine** — swap MediaPipe triangulation for simple cross-dissolve (pixel alpha blending)
2. **Restructure flow** — move engine selection after Gemini, add confirm step, cache & switch between engines
3. **Rate limiting** — server-side Gemini call limits (30/hour, 50/day)
4. **Demo landing page** — public page with original.jpg + modified.png demo, passcode gate for full tool
5. **Passcode protection** — env-based passcode, sessionStorage auth, API route validation

---

## 1. New User Flow

```
LANDING PAGE (public, no passcode needed)
├─ Hero: Demo morph animation (original.jpg ↔ modified.png cross-dissolve)
├─ Brief description of the research tool
└─ "Access Research Tool" button → passcode modal

RESEARCH TOOL (behind passcode, stored in sessionStorage)
├─ Step 1: Upload Photo
│  └─ Single file upload + preview + "Continue" button
├─ Step 2: Select Direction (Dark→Light / Light→Dark)
├─ Step 3: Gemini Processing (auto-starts after direction)
│  └─ Progress bar with shimmer + cycling messages
│  └─ Shows original vs modified when done
├─ Step 4: Choose Morph Engine (shown AFTER Gemini)
│  ├─ "facemorph.me API" — StyleGAN2 interpolation
│  └─ "Local (Cross-Dissolve)" — instant browser-based blending
│  └─ Morph runs immediately on selection
└─ Step 5: Results (with engine switching)
   ├─ Side-by-side comparison
   ├─ Morph slider (25 frames)
   ├─ Video (API mode only)
   ├─ Download panel
   └─ "Switch to [other engine]" button — cached results
```

Key changes from v1:
- Engine selection moved AFTER Gemini produces the modified image
- Added "Continue" confirm button after upload (in case of wrong file)
- Results cached per engine — switching is instant if already computed
- Only 1 image file allowed at a time

---

## 2. Local Morph: Cross-Dissolve

**Problem**: MediaPipe triangulation produces shattered-glass artifact effect.

**Solution**: Since both images are the same person/pose/expression (Gemini only changes skin tone), a simple pixel-level alpha blend produces smooth, natural results.

**Algorithm**:
```
For frame i in 0..24:
  t = i / 24
  For each pixel (x, y):
    output[x,y] = original[x,y] * (1-t) + modified[x,y] * t
```

**Implementation**:
- Load both images onto same-size canvases
- `getImageData()` from both
- Lerp every RGBA value
- `putImageData()` to output canvas
- Export as JPEG data URL
- ~25 frames in < 1 second (no ML models needed)

**Dependencies removed**: `@mediapipe/tasks-vision`, `triangulation.ts`

---

## 3. Rate Limiting

**Storage**: JSON file at project root (`rate-limit.json`)

**Structure**:
```json
{
  "calls": [
    { "timestamp": 1709352000000 },
    { "timestamp": 1709352060000 }
  ]
}
```

**Limits**:
- Hourly: 30 calls (rolling 60-minute window)
- Daily: 50 calls (rolling 24-hour window)

**Enforcement**: Server-side in `/api/modify-skin-tone/route.ts`
- Read file, filter timestamps within window, check count
- If over limit → return 429 with message + retry-after hint
- If under limit → append timestamp, proceed with Gemini call
- Client displays remaining quota after each call

---

## 4. Demo Landing Page

**Assets**: Copy `original.jpg` and `modified.png` to `public/demo/`

**Demo section**:
- Auto-playing cross-dissolve animation between original and modified
- Smooth CSS or canvas-based transition loop
- Brief text explaining the tool's research purpose

**Passcode gate**:
- "Access Research Tool" button triggers modal with passcode input
- Passcode checked via `/api/verify-passcode` route
- Env var: `ACCESS_PASSCODE` in `.env.local`
- On success: store flag in `sessionStorage`, redirect to tool
- On failure: shake animation + error message

---

## 5. Passcode Protection

**Env config**: `ACCESS_PASSCODE=<researcher-chosen-passcode>` in `.env.local`

**Verification flow**:
1. Client sends passcode to `/api/verify-passcode`
2. Server compares with `process.env.ACCESS_PASSCODE`
3. Returns success/failure
4. Client stores `authenticated=true` in `sessionStorage`
5. All protected API routes (`/api/modify-skin-tone`) also check for valid session

**Session behavior**:
- Cleared when browser tab closes (sessionStorage)
- No cookies, no persistent auth
- Re-enter passcode each session

---

## 6. Result Caching & Engine Switching

**Cache structure** (React `useRef`):
```typescript
const resultCache = useRef<Record<MorphEngine, MorphResult | null>>({
  'facemorph-api': null,
  'local': null,
});
```

**Behavior**:
- When engine selected: check cache → if hit, display instantly
- If miss: run engine pipeline, store in cache, display
- "Switch to [other engine]" button visible in results
- Cache cleared on "Start Over"
- Gemini result (modified image) shared between both engines (not re-run)

---

## Files to Create/Modify

**New files**:
- `src/app/api/verify-passcode/route.ts` — passcode verification endpoint
- `src/lib/rate-limiter.ts` — rate limiting logic
- `public/demo/original.jpg` — demo image (copy from root)
- `public/demo/modified.png` — demo image (copy from root)

**Modified files**:
- `src/app/page.tsx` — restructured flow, passcode gate, demo landing
- `src/lib/local-morph.ts` — complete rewrite to cross-dissolve
- `src/components/ProcessingPipeline.tsx` — caching, engine switching, new step order
- `src/components/MorphEngineSelector.tsx` — updated labels
- `src/app/api/modify-skin-tone/route.ts` — add rate limiting + passcode validation
- `src/types/index.ts` — updated types for caching
- `.env.local` — add ACCESS_PASSCODE
- `package.json` — remove @mediapipe/tasks-vision

**Deleted files**:
- `src/lib/triangulation.ts` — no longer needed

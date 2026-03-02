# Skin Tone Morph Tool v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the app with a demo landing page, passcode gate, cross-dissolve local morph, Gemini rate limiting, and engine-switching with cached results.

**Architecture:** Next.js 14 App Router. Public landing page with demo morph animation, passcode-gated research tool. Server-side rate limiting via JSON file. Two morph engines (facemorph.me API and local cross-dissolve) with cached results for instant switching.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, @google/genai, JSZip

---

### Task 1: Copy Demo Assets & Update Environment

**Files:**
- Copy: `public/demo/original.jpg` (from root `original.jpg`)
- Copy: `public/demo/modified.png` (from root `modified.png`)
- Modify: `.env.local`

**Step 1: Copy demo images to public directory**

Run:
```bash
mkdir -p /Users/arda/facemorph/public/demo
cp /Users/arda/facemorph/original.jpg /Users/arda/facemorph/public/demo/original.jpg
cp /Users/arda/facemorph/modified.png /Users/arda/facemorph/public/demo/modified.png
```

**Step 2: Add ACCESS_PASSCODE to .env.local**

Append to `/Users/arda/facemorph/.env.local`:
```
ACCESS_PASSCODE="research2026"
```

---

### Task 2: Remove MediaPipe Dependencies & Triangulation

**Files:**
- Modify: `package.json` — remove `@mediapipe/tasks-vision`
- Delete: `src/lib/triangulation.ts`

**Step 1: Remove @mediapipe/tasks-vision from package.json**

In `/Users/arda/facemorph/package.json`, remove the line:
```
"@mediapipe/tasks-vision": "^0.10.18",
```

**Step 2: Delete triangulation.ts**

Run:
```bash
rm /Users/arda/facemorph/src/lib/triangulation.ts
```

**Step 3: Reinstall dependencies**

Run:
```bash
cd /Users/arda/facemorph && npm install
```

---

### Task 3: Rewrite local-morph.ts as Cross-Dissolve

**Files:**
- Rewrite: `src/lib/local-morph.ts`

**Step 1: Replace entire file with cross-dissolve implementation**

Replace `/Users/arda/facemorph/src/lib/local-morph.ts` with:

```typescript
/**
 * Local morph engine: pixel-level cross-dissolve.
 *
 * Since both images are the same person/pose/expression (Gemini only changes
 * skin tone), a simple alpha blend between the two produces smooth,
 * natural-looking morph frames with zero artifacts.
 */

const MORPH_DIM = 512;

export async function generateCrossDissolveFrames(
  originalSrc: string,
  modifiedSrc: string,
  numFrames: number = 25,
  onProgress?: (frameIndex: number) => void
): Promise<string[]> {
  const [img1, img2] = await Promise.all([
    loadImg(originalSrc),
    loadImg(modifiedSrc),
  ]);

  // Draw both images to same-dimension canvases
  const data1 = getPixels(img1, MORPH_DIM, MORPH_DIM);
  const data2 = getPixels(img2, MORPH_DIM, MORPH_DIM);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = MORPH_DIM;
  outCanvas.height = MORPH_DIM;
  const outCtx = outCanvas.getContext('2d')!;

  const frames: string[] = [];

  for (let i = 0; i < numFrames; i++) {
    const t = numFrames === 1 ? 0 : i / (numFrames - 1);

    // Lerp every pixel
    const out = new ImageData(MORPH_DIM, MORPH_DIM);
    const len = data1.data.length;
    for (let j = 0; j < len; j++) {
      out.data[j] = Math.round(data1.data[j] * (1 - t) + data2.data[j] * t);
    }

    outCtx.putImageData(out, 0, 0);
    frames.push(outCanvas.toDataURL('image/jpeg', 0.92));
    onProgress?.(i);

    // Yield to prevent UI blocking
    if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return frames;
}

// --- helpers ---

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getPixels(img: HTMLImageElement, w: number, h: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
```

**Step 2: Verify the file builds**

Run: `cd /Users/arda/facemorph && npx next build 2>&1 | tail -5`

Note: This will fail because ProcessingPipeline still imports old functions. That's expected — we fix it in Task 5.

---

### Task 4: Create Rate Limiter

**Files:**
- Create: `src/lib/rate-limiter.ts`

**Step 1: Write rate limiter module**

Create `/Users/arda/facemorph/src/lib/rate-limiter.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const RATE_FILE = join(process.cwd(), 'rate-limit.json');
const HOURLY_LIMIT = 30;
const DAILY_LIMIT = 50;

interface RateData {
  calls: number[]; // timestamps in ms
}

function readRateData(): RateData {
  if (!existsSync(RATE_FILE)) return { calls: [] };
  try {
    return JSON.parse(readFileSync(RATE_FILE, 'utf-8'));
  } catch {
    return { calls: [] };
  }
}

function writeRateData(data: RateData): void {
  writeFileSync(RATE_FILE, JSON.stringify(data, null, 2));
}

export interface RateLimitResult {
  allowed: boolean;
  hourlyRemaining: number;
  dailyRemaining: number;
  retryAfterSeconds?: number;
  message?: string;
}

export function checkAndRecordCall(): RateLimitResult {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const data = readRateData();

  // Prune old entries (older than 24h)
  data.calls = data.calls.filter((ts) => ts > oneDayAgo);

  const hourCalls = data.calls.filter((ts) => ts > oneHourAgo);
  const dayCalls = data.calls;

  const hourlyRemaining = Math.max(0, HOURLY_LIMIT - hourCalls.length);
  const dailyRemaining = Math.max(0, DAILY_LIMIT - dayCalls.length);

  if (hourCalls.length >= HOURLY_LIMIT) {
    const oldestHour = hourCalls[0];
    const retryAfterSeconds = Math.ceil((oldestHour + 60 * 60 * 1000 - now) / 1000);
    writeRateData(data);
    return {
      allowed: false,
      hourlyRemaining: 0,
      dailyRemaining,
      retryAfterSeconds,
      message: `Hourly limit reached (${HOURLY_LIMIT}/hour). Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
    };
  }

  if (dayCalls.length >= DAILY_LIMIT) {
    const oldestDay = dayCalls[0];
    const retryAfterSeconds = Math.ceil((oldestDay + 24 * 60 * 60 * 1000 - now) / 1000);
    writeRateData(data);
    return {
      allowed: false,
      hourlyRemaining,
      dailyRemaining: 0,
      retryAfterSeconds,
      message: `Daily limit reached (${DAILY_LIMIT}/day). Try again in ${Math.ceil(retryAfterSeconds / 3600)} hours.`,
    };
  }

  // Record this call
  data.calls.push(now);
  writeRateData(data);

  return {
    allowed: true,
    hourlyRemaining: hourlyRemaining - 1,
    dailyRemaining: dailyRemaining - 1,
  };
}
```

---

### Task 5: Update Types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Update type definitions**

Replace entire `/Users/arda/facemorph/src/types/index.ts` with:

```typescript
export type ToneDirection = 'black-to-white' | 'white-to-black';

export type MorphEngine = 'facemorph-api' | 'local';

export type PipelineStep =
  | 'idle'
  | 'modifying-skin-tone'
  | 'encoding-original'
  | 'encoding-modified'
  | 'generating-morph-frames'
  | 'complete'
  | 'error';

export interface MorphResult {
  originalImage: File;
  originalImageUrl: string;
  modifiedImageBase64: string;
  modifiedImageUrl: string;
  direction: ToneDirection;
  engine: MorphEngine;
  originalGuid?: string;
  modifiedGuid?: string;
  mp4Url?: string;
  morphFrameUrls: string[];
}

export interface GeminiResult {
  modifiedImageBase64: string;
  modifiedMimeType: string;
  modifiedImageUrl: string;
  hourlyRemaining?: number;
  dailyRemaining?: number;
}

export interface PipelineState {
  step: PipelineStep;
  progress: number;
  error: string | null;
  result: MorphResult | null;
}

export type PipelineAction =
  | { type: 'START' }
  | { type: 'GEMINI_COMPLETE'; modifiedBase64: string; mimeType: string }
  | { type: 'ENCODE_COMPLETE'; originalGuid: string; modifiedGuid: string }
  | { type: 'FRAME_LOADED'; frameIndex: number; totalFrames: number }
  | { type: 'MORPH_COMPLETE'; morphFrameUrls: string[]; mp4Url?: string }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };
```

Changes: removed `'detecting-landmarks'` step, added `GeminiResult` interface for caching the Gemini output between engines.

---

### Task 6: Add Rate Limiting to Gemini API Route

**Files:**
- Modify: `src/app/api/modify-skin-tone/route.ts`

**Step 1: Add rate limiting at top of POST handler**

In `/Users/arda/facemorph/src/app/api/modify-skin-tone/route.ts`, add import at top:

```typescript
import { checkAndRecordCall } from '@/lib/rate-limiter';
```

Then, right after the API key check (line 13), add rate limiting check:

```typescript
  // Rate limiting
  const rateResult = checkAndRecordCall();
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: rateResult.message },
      {
        status: 429,
        headers: rateResult.retryAfterSeconds
          ? { 'Retry-After': String(rateResult.retryAfterSeconds) }
          : {},
      }
    );
  }
```

Also update the success response (line 102-105) to include remaining quota:

```typescript
    return NextResponse.json({
      modifiedImageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
      hourlyRemaining: rateResult.hourlyRemaining,
      dailyRemaining: rateResult.dailyRemaining,
    });
```

---

### Task 7: Create Passcode Verification API Route

**Files:**
- Create: `src/app/api/verify-passcode/route.ts`

**Step 1: Write passcode verification endpoint**

Create `/Users/arda/facemorph/src/app/api/verify-passcode/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const passcode = process.env.ACCESS_PASSCODE;
  if (!passcode) {
    // If no passcode configured, allow access (dev mode)
    return NextResponse.json({ success: true });
  }

  let body: { passcode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.passcode) {
    return NextResponse.json({ error: 'Passcode required' }, { status: 400 });
  }

  if (body.passcode === passcode) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
}
```

---

### Task 8: Update MorphEngineSelector Labels

**Files:**
- Modify: `src/components/MorphEngineSelector.tsx`

**Step 1: Update the local engine label and description**

In `/Users/arda/facemorph/src/components/MorphEngineSelector.tsx`, replace lines 26-30:

Old:
```typescript
    {
      value: 'local',
      label: 'Local (Browser)',
      desc: 'MediaPipe landmark morphing — runs entirely in your browser',
    },
```

New:
```typescript
    {
      value: 'local',
      label: 'Local (Cross-Dissolve)',
      desc: 'Instant pixel blending — runs entirely in your browser, no external service',
    },
```

---

### Task 9: Rewrite ProcessingPipeline with Caching Support

**Files:**
- Rewrite: `src/components/ProcessingPipeline.tsx`

This is the most complex task. The pipeline now:
1. Only runs ONE engine at a time (not Gemini + morph together)
2. Receives the Gemini result from the parent (already done before engine selection)
3. Caches nothing itself — parent handles caching

**Step 1: Replace entire ProcessingPipeline.tsx**

Replace `/Users/arda/facemorph/src/components/ProcessingPipeline.tsx` with:

```typescript
'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  MorphEngine,
  MorphResult,
  GeminiResult,
  PipelineState,
  PipelineAction,
  ToneDirection,
} from '@/types';
import { base64ToBlob, base64ToObjectUrl, loadImage } from '@/lib/image-utils';
import {
  encodeImage,
  getMorphFrameUrl,
  getMp4Url,
  VIDEO_DIM,
  NUM_MORPH_FRAMES,
} from '@/lib/facemorph-api';
import { generateCrossDissolveFrames } from '@/lib/local-morph';
import ProgressTracker from './ProgressTracker';
import ErrorDisplay from './ErrorDisplay';

function reducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'START':
      return { step: 'encoding-original', progress: 5, error: null, result: null };
    case 'ENCODE_COMPLETE':
      return { ...state, step: 'generating-morph-frames', progress: 50 };
    case 'FRAME_LOADED': {
      const pct = 50 + Math.round((action.frameIndex / action.totalFrames) * 45);
      return { ...state, progress: Math.min(pct, 95) };
    }
    case 'MORPH_COMPLETE':
      return { ...state, step: 'complete', progress: 100 };
    case 'ERROR':
      return { ...state, step: 'error', error: action.message };
    case 'RESET':
      return { step: 'idle', progress: 0, error: null, result: null };
    default:
      return state;
  }
}

interface Props {
  image: { file: File; base64: string; mimeType: string };
  direction: ToneDirection;
  engine: MorphEngine;
  geminiResult: GeminiResult;
  onComplete: (result: MorphResult) => void;
}

export default function ProcessingPipeline({
  image,
  direction,
  engine,
  geminiResult,
  onComplete,
}: Props) {
  const [state, dispatch] = useReducer(reducer, {
    step: 'idle',
    progress: 0,
    error: null,
    result: null,
  });

  const hasRun = useRef(false);

  const run = useCallback(async () => {
    dispatch({ type: 'START' });

    const originalUrl = URL.createObjectURL(image.file);
    const modifiedUrl = geminiResult.modifiedImageUrl;

    try {
      let morphFrameUrls: string[];
      let mp4Url: string | undefined;
      let originalGuid: string | undefined;
      let modifiedGuid: string | undefined;

      if (engine === 'facemorph-api') {
        // Encode both images via facemorph.me API
        const modifiedBlob = base64ToBlob(
          geminiResult.modifiedImageBase64,
          geminiResult.modifiedMimeType
        );

        const [origResult, modResult] = await Promise.all([
          encodeImage(image.file),
          encodeImage(modifiedBlob),
        ]);

        originalGuid = origResult.guid;
        modifiedGuid = modResult.guid;

        dispatch({
          type: 'ENCODE_COMPLETE',
          originalGuid: origResult.guid,
          modifiedGuid: modResult.guid,
        });

        morphFrameUrls = Array.from({ length: NUM_MORPH_FRAMES }, (_, i) =>
          getMorphFrameUrl(origResult.guid, modResult.guid, VIDEO_DIM, NUM_MORPH_FRAMES, i)
        );
        mp4Url = getMp4Url(origResult.guid, modResult.guid);

        // Preload frames
        await Promise.all(
          morphFrameUrls.map(
            (url, i) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                  dispatch({ type: 'FRAME_LOADED', frameIndex: i, totalFrames: NUM_MORPH_FRAMES });
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = url;
              })
          )
        );
      } else {
        // Local cross-dissolve
        dispatch({ type: 'ENCODE_COMPLETE', originalGuid: '', modifiedGuid: '' });

        morphFrameUrls = await generateCrossDissolveFrames(
          originalUrl,
          modifiedUrl,
          NUM_MORPH_FRAMES,
          (i) => dispatch({ type: 'FRAME_LOADED', frameIndex: i, totalFrames: NUM_MORPH_FRAMES })
        );
      }

      const result: MorphResult = {
        originalImage: image.file,
        originalImageUrl: originalUrl,
        modifiedImageBase64: geminiResult.modifiedImageBase64,
        modifiedImageUrl: modifiedUrl,
        direction,
        engine,
        originalGuid,
        modifiedGuid,
        mp4Url,
        morphFrameUrls,
      };

      dispatch({ type: 'MORPH_COMPLETE', morphFrameUrls, mp4Url });
      onComplete(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      dispatch({ type: 'ERROR', message });
    }
  }, [image, direction, engine, geminiResult, onComplete]);

  // Auto-run on mount
  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      run();
    }
  }, [run]);

  if (state.step === 'idle' || state.step === 'complete') return null;

  return (
    <div className="space-y-4">
      {state.step !== 'error' && (
        <ProgressTracker step={state.step} progress={state.progress} />
      )}

      {state.step === 'error' && state.error && (
        <ErrorDisplay
          message={state.error}
          onRetry={() => {
            hasRun.current = false;
            dispatch({ type: 'RESET' });
          }}
        />
      )}
    </div>
  );
}
```

---

### Task 10: Update ProgressTracker for New Steps

**Files:**
- Modify: `src/components/ProgressTracker.tsx`

**Step 1: Remove detecting-landmarks from step labels**

In `/Users/arda/facemorph/src/components/ProgressTracker.tsx`, update the `STEP_LABELS` object (lines 11-19). Remove `'detecting-landmarks'` entry:

Old:
```typescript
const STEP_LABELS: Record<string, string> = {
  'modifying-skin-tone': 'Modifying skin tone (Gemini AI)',
  'encoding-original': 'Encoding original face',
  'encoding-modified': 'Encoding modified face',
  'detecting-landmarks': 'Detecting facial landmarks',
  'generating-morph-frames': 'Generating morph frames',
  complete: 'Complete',
  error: 'Error',
};
```

New:
```typescript
const STEP_LABELS: Record<string, string> = {
  'modifying-skin-tone': 'Modifying skin tone (Gemini AI)',
  'encoding-original': 'Processing faces',
  'encoding-modified': 'Processing faces',
  'generating-morph-frames': 'Generating morph frames',
  complete: 'Complete',
  error: 'Error',
};
```

---

### Task 11: Rewrite page.tsx — Full Restructure

**Files:**
- Rewrite: `src/app/page.tsx`

This is the biggest change. The page now has:
1. A public landing page with demo + passcode gate
2. The research tool behind the passcode
3. Gemini runs first, THEN engine selection
4. Result caching per engine for instant switching

**Step 1: Replace entire page.tsx**

Replace `/Users/arda/facemorph/src/app/page.tsx` with:

```typescript
'use client';

import { useCallback, useRef, useState } from 'react';
import { ToneDirection, MorphEngine, MorphResult, GeminiResult } from '@/types';
import PhotoUploader from '@/components/PhotoUploader';
import DirectionSelector from '@/components/DirectionSelector';
import MorphEngineSelector from '@/components/MorphEngineSelector';
import ProcessingPipeline from '@/components/ProcessingPipeline';
import ImageComparison from '@/components/ImageComparison';
import MorphSlider from '@/components/MorphSlider';
import MorphVideo from '@/components/MorphVideo';
import DownloadPanel from '@/components/DownloadPanel';
import ProgressTracker from '@/components/ProgressTracker';
import ErrorDisplay from '@/components/ErrorDisplay';

/* ------------------------------------------------------------------ */
/*  Landing Page (public demo + passcode gate)                         */
/* ------------------------------------------------------------------ */

function LandingPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError('');

    try {
      const res = await fetch('/api/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      if (res.ok) {
        sessionStorage.setItem('authenticated', 'true');
        onAuthenticated();
      } else {
        setError('Invalid passcode');
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-12">
        {/* Header */}
        <header className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">
            Skin Tone Morph Research Tool
          </h1>
          <p className="text-gray-500 max-w-lg mx-auto">
            Generate controlled face morphs between original and
            skin-tone-modified images for perception bias research.
          </p>
        </header>

        {/* Demo animation */}
        <DemoMorphAnimation />

        {/* Passcode gate */}
        <div className="max-w-sm mx-auto">
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 text-center">
              Enter researcher passcode to access the tool
            </label>
            <div className={`flex gap-2 ${shake ? 'animate-shake' : ''}`}>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Passcode"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <button
                type="submit"
                disabled={!passcode || checking}
                className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {checking ? 'Checking...' : 'Enter'}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}
          </form>
        </div>

        <footer className="text-center">
          <p className="text-xs text-gray-400">
            For academic research purposes only. Uses Gemini AI for skin tone
            modification and face morphing for generating intermediate frames.
          </p>
        </footer>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Demo Morph Animation (auto-playing cross-dissolve loop)            */
/* ------------------------------------------------------------------ */

function DemoMorphAnimation() {
  const [opacity, setOpacity] = useState(0);
  const directionRef = useRef<'forward' | 'backward'>('forward');

  // CSS-based crossfade loop
  useState(() => {
    const interval = setInterval(() => {
      setOpacity((prev) => {
        if (directionRef.current === 'forward') {
          if (prev >= 1) {
            directionRef.current = 'backward';
            return prev - 0.02;
          }
          return prev + 0.02;
        } else {
          if (prev <= 0) {
            directionRef.current = 'forward';
            return prev + 0.02;
          }
          return prev - 0.02;
        }
      });
    }, 60);
    return () => clearInterval(interval);
  });

  return (
    <div className="flex justify-center">
      <div className="relative w-64 h-64 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <img
          src="/demo/original.jpg"
          alt="Original"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <img
          src="/demo/modified.png"
          alt="Modified"
          className="absolute inset-0 w-full h-full object-cover transition-none"
          style={{ opacity }}
        />
        <div className="absolute bottom-2 left-2 right-2 text-center">
          <span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full">
            Demo: skin tone morph
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Research Tool (behind passcode)                                    */
/* ------------------------------------------------------------------ */

type ToolPhase = 'upload' | 'direction' | 'gemini' | 'engine' | 'morphing' | 'results';

function ResearchTool() {
  // Core state
  const [image, setImage] = useState<{
    file: File;
    base64: string;
    mimeType: string;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [direction, setDirection] = useState<ToneDirection | null>(null);
  const [engine, setEngine] = useState<MorphEngine | null>(null);
  const [geminiResult, setGeminiResult] = useState<GeminiResult | null>(null);
  const [activeResult, setActiveResult] = useState<MorphResult | null>(null);
  const [uploaderKey, setUploaderKey] = useState(0);

  // Gemini step state
  const [geminiRunning, setGeminiRunning] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiProgress, setGeminiProgress] = useState(0);

  // Rate limit display
  const [quota, setQuota] = useState<{ hourly: number; daily: number } | null>(null);

  // Result cache per engine
  const resultCache = useRef<Record<MorphEngine, MorphResult | null>>({
    'facemorph-api': null,
    local: null,
  });

  // Determine current phase
  const getPhase = (): ToolPhase => {
    if (!image || !confirmed) return 'upload';
    if (!direction) return 'direction';
    if (!geminiResult) return 'gemini';
    if (!engine) return 'engine';
    if (!activeResult) return 'morphing';
    return 'results';
  };

  const phase = getPhase();

  const handleImageSelected = useCallback(
    (file: File, base64: string, mimeType: string) => {
      setImage({ file, base64, mimeType });
      setConfirmed(false);
      setDirection(null);
      setGeminiResult(null);
      setEngine(null);
      setActiveResult(null);
      resultCache.current = { 'facemorph-api': null, local: null };
    },
    []
  );

  // Run Gemini after direction is selected
  const runGemini = useCallback(async () => {
    if (!image || !direction) return;

    setGeminiRunning(true);
    setGeminiError(null);
    setGeminiProgress(5);

    // Simulate progress while waiting for API
    const progressInterval = setInterval(() => {
      setGeminiProgress((prev) => Math.min(prev + 1, 28));
    }, 800);

    try {
      const res = await fetch('/api/modify-skin-tone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: image.base64,
          mimeType: image.mimeType,
          direction,
        }),
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || `API returned ${res.status}`);
      }

      const data = await res.json();
      const modifiedUrl = URL.createObjectURL(
        base64ToBlob(data.modifiedImageBase64, data.mimeType)
      );

      setGeminiResult({
        modifiedImageBase64: data.modifiedImageBase64,
        modifiedMimeType: data.mimeType,
        modifiedImageUrl: modifiedUrl,
        hourlyRemaining: data.hourlyRemaining,
        dailyRemaining: data.dailyRemaining,
      });

      if (data.hourlyRemaining !== undefined) {
        setQuota({ hourly: data.hourlyRemaining, daily: data.dailyRemaining });
      }

      setGeminiProgress(100);
    } catch (err: unknown) {
      clearInterval(progressInterval);
      const message = err instanceof Error ? err.message : 'Failed to modify image';
      setGeminiError(message);
    } finally {
      setGeminiRunning(false);
    }
  }, [image, direction]);

  // Handle direction selection → auto-trigger Gemini
  const handleDirectionChange = useCallback(
    (d: ToneDirection) => {
      setDirection(d);
      setGeminiResult(null);
      setEngine(null);
      setActiveResult(null);
      resultCache.current = { 'facemorph-api': null, local: null };
      // Trigger Gemini after state update
      setTimeout(() => {
        // We need to call runGemini, but it depends on latest state
        // So we use a flag and useEffect instead
      }, 0);
    },
    []
  );

  // Auto-run Gemini when direction changes
  const geminiTriggered = useRef(false);
  const prevDirection = useRef<ToneDirection | null>(null);

  if (direction && direction !== prevDirection.current && confirmed && image) {
    prevDirection.current = direction;
    geminiTriggered.current = true;
  }

  // useEffect to run Gemini
  const geminiRunRef = useRef(runGemini);
  geminiRunRef.current = runGemini;

  // We'll use a simpler approach: run Gemini via button click instead of auto-trigger
  // This is cleaner and avoids complex ref management

  const handleEngineSelect = useCallback(
    (e: MorphEngine) => {
      setEngine(e);

      // Check cache
      const cached = resultCache.current[e];
      if (cached) {
        setActiveResult(cached);
      } else {
        setActiveResult(null);
      }
    },
    []
  );

  const handleMorphComplete = useCallback(
    (result: MorphResult) => {
      setActiveResult(result);
      if (engine) {
        resultCache.current[engine] = result;
      }
    },
    [engine]
  );

  const handleSwitchEngine = useCallback(() => {
    if (!engine) return;
    const other: MorphEngine = engine === 'facemorph-api' ? 'local' : 'facemorph-api';
    handleEngineSelect(other);
  }, [engine, handleEngineSelect]);

  const handleStartOver = () => {
    setImage(null);
    setConfirmed(false);
    setDirection(null);
    setGeminiResult(null);
    setEngine(null);
    setActiveResult(null);
    setGeminiError(null);
    setGeminiProgress(0);
    setQuota(null);
    resultCache.current = { 'facemorph-api': null, local: null };
    setUploaderKey((k) => k + 1);
  };

  const otherEngine: MorphEngine | null = engine
    ? engine === 'facemorph-api'
      ? 'local'
      : 'facemorph-api'
    : null;

  const otherEngineLabel = otherEngine === 'facemorph-api'
    ? 'facemorph.me API'
    : 'Local (Cross-Dissolve)';

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Skin Tone Morph Research Tool
          </h1>
          <p className="text-sm text-gray-500">
            Generate face morphs between original and skin-tone-modified images
            for perception bias research.
          </p>
          {quota && (
            <p className="text-xs text-gray-400">
              API quota remaining — hourly: {quota.hourly} · daily: {quota.daily}
            </p>
          )}
        </header>

        {/* Step 1: Upload */}
        <section className="space-y-2">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            1. Upload Photo
          </label>
          <PhotoUploader
            key={uploaderKey}
            onImageSelected={handleImageSelected}
            disabled={geminiRunning || !!activeResult}
          />
          {image && !confirmed && (
            <button
              onClick={() => setConfirmed(true)}
              className="w-full py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continue with this photo
            </button>
          )}
        </section>

        {/* Step 2: Direction */}
        {confirmed && (
          <section className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              2. Select Tone Direction
            </label>
            <DirectionSelector
              direction={direction}
              onChange={handleDirectionChange}
              disabled={geminiRunning || !!geminiResult}
            />
          </section>
        )}

        {/* Step 3: Gemini processing */}
        {confirmed && direction && !geminiResult && !geminiRunning && !geminiError && (
          <button
            onClick={runGemini}
            className="w-full py-3 px-6 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-all duration-200"
          >
            Generate Modified Image
          </button>
        )}

        {geminiRunning && (
          <ProgressTracker step="modifying-skin-tone" progress={geminiProgress} />
        )}

        {geminiError && (
          <ErrorDisplay
            message={geminiError}
            onRetry={() => {
              setGeminiError(null);
              setGeminiProgress(0);
              runGemini();
            }}
          />
        )}

        {/* Show comparison after Gemini */}
        {geminiResult && image && direction && (
          <ImageComparison
            originalUrl={URL.createObjectURL(image.file)}
            modifiedUrl={geminiResult.modifiedImageUrl}
            direction={direction}
          />
        )}

        {/* Step 4: Engine selection (after Gemini) */}
        {geminiResult && !activeResult && phase !== 'morphing' && (
          <section>
            <MorphEngineSelector
              engine={engine || 'facemorph-api'}
              onChange={handleEngineSelect}
              disabled={false}
            />
          </section>
        )}

        {/* Morphing pipeline */}
        {geminiResult && engine && !activeResult && image && direction && (
          <ProcessingPipeline
            key={`${engine}-${uploaderKey}`}
            image={image}
            direction={direction}
            engine={engine}
            geminiResult={geminiResult}
            onComplete={handleMorphComplete}
          />
        )}

        {/* Results */}
        {activeResult && (
          <div className="space-y-6 pt-2">
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Morph Results
                </h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                  {activeResult.engine === 'facemorph-api'
                    ? 'facemorph.me API'
                    : 'Local (Cross-Dissolve)'}
                </span>
              </div>
            </div>

            <MorphSlider frameUrls={activeResult.morphFrameUrls} />

            <MorphVideo
              mp4Url={activeResult.mp4Url}
              frameUrls={activeResult.morphFrameUrls}
            />

            <DownloadPanel result={activeResult} />

            {/* Switch engine button */}
            {otherEngine && (
              <button
                onClick={handleSwitchEngine}
                className="w-full py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {resultCache.current[otherEngine]
                  ? `View ${otherEngineLabel} results`
                  : `Try ${otherEngineLabel}`}
              </button>
            )}

            <button
              onClick={handleStartOver}
              className="w-full py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Start Over with New Photo
            </button>
          </div>
        )}

        {/* Footer */}
        <footer className="border-t border-gray-200 pt-6 text-center">
          <p className="text-xs text-gray-400">
            For academic research purposes only. Uses Gemini AI for skin tone
            modification and face morphing for generating intermediate frames.
          </p>
        </footer>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Root: auth gate                                                    */
/* ------------------------------------------------------------------ */

// Need this import at the function level since it's used in runGemini
import { base64ToBlob } from '@/lib/image-utils';

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);

  // Check sessionStorage on mount
  useState(() => {
    if (typeof window !== 'undefined') {
      setAuthenticated(sessionStorage.getItem('authenticated') === 'true');
    }
  });

  if (!authenticated) {
    return <LandingPage onAuthenticated={() => setAuthenticated(true)} />;
  }

  return <ResearchTool />;
}
```

---

### Task 12: Add Shake Animation to CSS

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Add shake keyframes**

In `/Users/arda/facemorph/src/app/globals.css`, add after the shimmer keyframes:

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}
```

---

### Task 13: Add rate-limit.json to .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add rate-limit.json**

Append to `/Users/arda/facemorph/.gitignore`:
```
rate-limit.json
```

---

### Task 14: Build & Fix TypeScript Errors

**Step 1: Run the build**

Run: `cd /Users/arda/facemorph && npx next build 2>&1`

**Step 2: Fix any TypeScript errors**

Common issues to watch for:
- `base64ToBlob` import in page.tsx (it's used inside ResearchTool's `runGemini`)
- `GeminiResult` type may need adjusting
- ProcessingPipeline props changed (now requires `geminiResult`)

Fix all errors until build succeeds.

---

### Task 15: Verify in Preview

**Step 1: Start dev server**

Run: `cd /Users/arda/facemorph && npm run dev`

**Step 2: Verify landing page**

- Check demo animation plays (crossfade between original and modified)
- Check passcode input appears
- Try wrong passcode → expect error
- Enter correct passcode (`research2026`) → expect tool access

**Step 3: Verify research tool flow**

- Upload image → "Continue" button appears
- Select direction → "Generate Modified Image" button appears
- After Gemini → comparison shown, engine selector appears
- Select engine → morph runs → results with switch button

**Step 4: Verify engine switching**

- Complete morph with one engine
- Click "Try [other engine]" → should run other engine
- Click "View [first engine] results" → should instantly show cached results

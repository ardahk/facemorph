'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ToneDirection, MorphEngine, MorphResult, GeminiResult } from '@/types';
import { base64ToBlob } from '@/lib/image-utils';
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

  useEffect(() => {
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
  }, []);

  return (
    <div className="flex justify-center">
      <div className="relative w-64 h-64 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/demo/original.jpg"
          alt="Original"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/demo/modified.png"
          alt="Modified"
          className="absolute inset-0 w-full h-full object-cover"
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

  // Pipeline key to force remount
  const [pipelineKey, setPipelineKey] = useState(0);

  const handleImageSelected = useCallback(
    (file: File, base64: string, mimeType: string) => {
      setImage({ file, base64, mimeType });
      setConfirmed(false);
      setDirection(null);
      setGeminiResult(null);
      setEngine(null);
      setActiveResult(null);
      setGeminiError(null);
      setGeminiProgress(0);
      resultCache.current = { 'facemorph-api': null, local: null };
    },
    []
  );

  // Run Gemini
  const runGemini = useCallback(async () => {
    if (!image || !direction) return;

    setGeminiRunning(true);
    setGeminiError(null);
    setGeminiProgress(5);

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

  const handleDirectionChange = useCallback(
    (d: ToneDirection) => {
      setDirection(d);
      setGeminiResult(null);
      setEngine(null);
      setActiveResult(null);
      setGeminiError(null);
      setGeminiProgress(0);
      resultCache.current = { 'facemorph-api': null, local: null };
    },
    []
  );

  const handleEngineSelect = useCallback(
    (e: MorphEngine) => {
      setEngine(e);
      // Check cache
      const cached = resultCache.current[e];
      if (cached) {
        setActiveResult(cached);
      } else {
        setActiveResult(null);
        setPipelineKey((k) => k + 1);
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

  // Should the morph pipeline be running?
  const shouldRunPipeline = !!geminiResult && !!engine && !activeResult && !!image && !!direction;

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

        {geminiError && !geminiRunning && (
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
        {geminiResult && (
          <section>
            <MorphEngineSelector
              engine={engine || 'facemorph-api'}
              onChange={handleEngineSelect}
              disabled={shouldRunPipeline}
            />
          </section>
        )}

        {/* Morphing pipeline */}
        {shouldRunPipeline && (
          <ProcessingPipeline
            key={`${engine}-${pipelineKey}`}
            image={image!}
            direction={direction!}
            engine={engine!}
            geminiResult={geminiResult!}
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

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthenticated(sessionStorage.getItem('authenticated') === 'true');
    }
  }, []);

  if (!authenticated) {
    return <LandingPage onAuthenticated={() => setAuthenticated(true)} />;
  }

  return <ResearchTool />;
}

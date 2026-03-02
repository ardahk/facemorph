'use client';

import { useEffect, useState } from 'react';
import { PipelineStep } from '@/types';

interface Props {
  step: PipelineStep;
  progress: number;
}

const STEP_LABELS: Record<string, string> = {
  'modifying-skin-tone': 'Modifying skin tone (Gemini AI)',
  'encoding-original': 'Processing faces',
  'encoding-modified': 'Processing faces',
  'generating-morph-frames': 'Generating morph frames',
  complete: 'Complete',
  error: 'Error',
};

const WAITING_MESSAGES = [
  'Analyzing facial features...',
  'Adjusting skin pigmentation...',
  'Preserving facial structure...',
  'Blending tone naturally...',
  'Refining details...',
  'Almost there...',
];

export default function ProgressTracker({ step, progress }: Props) {
  const [waitingIdx, setWaitingIdx] = useState(0);

  // Cycle through waiting messages during long Gemini step
  useEffect(() => {
    if (step !== 'modifying-skin-tone') return;
    const interval = setInterval(() => {
      setWaitingIdx((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [step]);

  if (step === 'idle' || step === 'complete') return null;

  const label = STEP_LABELS[step] || step;
  const isGeminiStep = step === 'modifying-skin-tone';

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-400 tabular-nums">{Math.round(progress)}%</span>
      </div>

      {/* Progress bar with animated shimmer during slow steps */}
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out relative ${
            isGeminiStep ? 'bg-gradient-to-r from-blue-500 via-blue-400 to-blue-600' : 'bg-blue-600'
          }`}
          style={{ width: `${Math.max(progress, isGeminiStep ? 8 : progress)}%` }}
        >
          {isGeminiStep && (
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div
                className="h-full w-[200%] animate-shimmer"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                  animation: 'shimmer 2s infinite linear',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Subtle activity text for Gemini step */}
      {isGeminiStep && (
        <p className="text-xs text-gray-400 animate-pulse transition-all duration-500">
          {WAITING_MESSAGES[waitingIdx]}
        </p>
      )}

      {step === 'error' && (
        <p className="text-sm text-red-600">Something went wrong. See error details below.</p>
      )}
    </div>
  );
}

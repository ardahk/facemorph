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
import { base64ToBlob } from '@/lib/image-utils';
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

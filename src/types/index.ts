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

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  frameUrls: string[];
}

export default function MorphSlider({ frameUrls }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const [frameIndex, setFrameIndex] = useState(Math.floor(frameUrls.length / 2));
  const [loadedCount, setLoadedCount] = useState(0);

  // Preload all frames
  useEffect(() => {
    let count = 0;
    const images = frameUrls.map((url) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        count++;
        setLoadedCount(count);
      };
      img.src = url;
      return img;
    });
    imagesRef.current = images;
    setFrameIndex(Math.floor(frameUrls.length / 2));
    setLoadedCount(0);
  }, [frameUrls]);

  // Draw current frame to canvas
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imagesRef.current[frameIndex];
    if (!canvas || !img || !img.complete || !img.naturalWidth) return;

    // Set canvas to exact image dimensions
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    }
  }, [frameIndex]);

  useEffect(() => {
    drawFrame();
  }, [drawFrame, loadedCount]);

  const allLoaded = loadedCount === frameUrls.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Morph Slider
        </p>
        {!allLoaded && (
          <p className="text-xs text-gray-400">
            Loading frames... {loadedCount}/{frameUrls.length}
          </p>
        )}
      </div>
      <div className="flex justify-center">
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 inline-block">
          <canvas
            ref={canvasRef}
            className="block max-w-full h-auto"
          />
        </div>
      </div>
      <div className="flex items-center gap-3 max-w-[512px] mx-auto">
        <span className="text-xs text-gray-400 shrink-0">Original</span>
        <input
          type="range"
          min={0}
          max={frameUrls.length - 1}
          value={frameIndex}
          onChange={(e) => setFrameIndex(Number(e.target.value))}
          className="flex-1 accent-blue-600"
        />
        <span className="text-xs text-gray-400 shrink-0">Modified</span>
      </div>
      <p className="text-xs text-gray-400 text-center">
        Frame {frameIndex + 1} of {frameUrls.length}
      </p>
    </div>
  );
}

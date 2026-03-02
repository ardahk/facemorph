'use client';

import { ToneDirection } from '@/types';

interface Props {
  originalUrl: string;
  modifiedUrl: string;
  direction: ToneDirection;
}

export default function ImageComparison({
  originalUrl,
  modifiedUrl,
  direction,
}: Props) {
  const dirLabel =
    direction === 'black-to-white' ? 'Light version' : 'Dark version';

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Original
        </p>
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
          <img
            src={originalUrl}
            alt="Original"
            className="w-full aspect-square object-cover"
          />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {dirLabel}
        </p>
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
          <img
            src={modifiedUrl}
            alt="Modified"
            className="w-full aspect-square object-cover"
          />
        </div>
      </div>
    </div>
  );
}

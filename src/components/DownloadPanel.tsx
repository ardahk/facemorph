'use client';

import { useState } from 'react';
import { MorphResult } from '@/types';
import { base64ToBlob, triggerDownload } from '@/lib/image-utils';
import { downloadFramesZip, downloadEverythingZip } from '@/lib/zip-builder';

interface Props {
  result: MorphResult;
}

export default function DownloadPanel({ result }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (key: string, fn: () => Promise<void>) => {
    setDownloading(key);
    try {
      await fn();
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setDownloading(null);
    }
  };

  const downloadOriginal = async () => {
    triggerDownload(result.originalImage, result.originalImage.name);
  };

  const downloadModified = async () => {
    const blob = base64ToBlob(result.modifiedImageBase64, 'image/png');
    triggerDownload(blob, 'modified.png');
  };

  const downloadMp4 = async () => {
    if (!result.mp4Url) return;
    const res = await fetch(result.mp4Url);
    const blob = await res.blob();
    triggerDownload(blob, 'morph-video.mp4');
  };

  const individualButtons = [
    { key: 'original', label: 'Original', fn: downloadOriginal },
    { key: 'modified', label: 'Modified', fn: downloadModified },
    {
      key: 'frames',
      label: 'All Frames (ZIP)',
      fn: () => downloadFramesZip(result.morphFrameUrls),
    },
    ...(result.mp4Url
      ? [{ key: 'mp4', label: 'Video (MP4)', fn: downloadMp4 }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Downloads
      </p>
      <div className="flex flex-wrap gap-2">
        {individualButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => handleDownload(btn.key, btn.fn)}
            disabled={downloading !== null}
            className={`
              px-4 py-2 text-sm font-medium rounded-lg border transition-colors
              ${
                downloading === btn.key
                  ? 'bg-gray-100 text-gray-400 border-gray-200'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
              }
            `}
          >
            {downloading === btn.key ? 'Downloading...' : btn.label}
          </button>
        ))}
      </div>

      {/* Everything ZIP — prominent, separate */}
      <button
        onClick={() =>
          handleDownload('everything', () =>
            downloadEverythingZip(
              result.originalImage,
              result.modifiedImageBase64,
              result.morphFrameUrls,
              result.mp4Url
            )
          )
        }
        disabled={downloading !== null}
        className={`
          w-full py-3 text-sm font-semibold rounded-lg transition-colors
          ${
            downloading === 'everything'
              ? 'bg-gray-200 text-gray-400'
              : 'bg-gray-900 text-white hover:bg-gray-800 active:bg-gray-700'
          }
        `}
      >
        {downloading === 'everything'
          ? 'Preparing ZIP...'
          : 'Download Everything (ZIP)'}
      </button>
    </div>
  );
}

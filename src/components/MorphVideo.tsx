'use client';

interface Props {
  mp4Url?: string;
  frameUrls?: string[];
}

export default function MorphVideo({ mp4Url }: Props) {
  if (!mp4Url) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Morph Video
      </p>
      <div className="flex justify-center">
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 inline-block">
          <video
            src={mp4Url}
            controls
            autoPlay
            loop
            muted
            playsInline
            className="block max-w-full h-auto"
            style={{ maxWidth: 512 }}
          />
        </div>
      </div>
    </div>
  );
}

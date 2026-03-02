'use client';

import { MorphEngine } from '@/types';

interface Props {
  engine: MorphEngine;
  onChange: (e: MorphEngine) => void;
  disabled?: boolean;
}

export default function MorphEngineSelector({
  engine,
  onChange,
  disabled,
}: Props) {
  const options: {
    value: MorphEngine;
    label: string;
    desc: string;
  }[] = [
    {
      value: 'local',
      label: 'Local (Cross-Dissolve)',
      desc: 'Instant pixel blending — runs entirely in your browser, no external service',
    },
    {
      value: 'facemorph-api',
      label: 'facemorph.me API',
      desc: 'StyleGAN2 interpolation — higher quality, requires external service',
    },
  ];

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Morph Engine
      </label>
      <div className="flex gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`
              flex-1 p-3 rounded-lg text-left transition-all duration-200 border
              ${
                engine === opt.value
                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="text-sm font-medium text-gray-900">{opt.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

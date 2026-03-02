'use client';

import { ToneDirection } from '@/types';

interface Props {
  direction: ToneDirection | null;
  onChange: (d: ToneDirection) => void;
  disabled?: boolean;
}

export default function DirectionSelector({
  direction,
  onChange,
  disabled,
}: Props) {
  const options: { value: ToneDirection; label: string }[] = [
    { value: 'black-to-white', label: 'Dark \u2192 Light' },
    { value: 'white-to-black', label: 'Light \u2192 Dark' },
  ];

  return (
    <div className="flex gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={`
            flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 border
            ${
              direction === opt.value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

'use client';

interface Props {
  message: string;
  onRetry: () => void;
}

export default function ErrorDisplay({ message, onRetry }: Props) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 text-red-500 mt-0.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
          />
        </svg>
        <p className="text-sm text-red-800">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

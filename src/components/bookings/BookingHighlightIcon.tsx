import { BookingHighlightCode } from '@/types/bookings';
import { KeyRound } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  highlightCode: BookingHighlightCode;
}

export function BookingHighlightIcon({ highlightCode }: Props) {
  if (highlightCode === 'none') return null;

  if (highlightCode === 'key') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 border border-yellow-400 text-yellow-700">
        <KeyRound className="w-3 h-3" />
      </span>
    );
  }

  const colorClass =
    highlightCode === 'dot_green'
      ? 'bg-green-500'
      : highlightCode === 'dot_amber'
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <span
      className={clsx(
        'inline-block w-3 h-3 rounded-full border border-white shadow-sm',
        colorClass
      )}
    />
  );
}






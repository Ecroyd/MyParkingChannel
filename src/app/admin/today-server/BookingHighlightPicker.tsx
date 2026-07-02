'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BookingHighlightIcon } from '@/components/bookings/BookingHighlightIcon';
import { BookingHighlightCode } from '@/types/bookings';
import { memo } from 'react';

const OPTIONS: { code: BookingHighlightCode; label: string }[] = [
  { code: 'key', label: 'Key icon' },
  { code: 'dot_green', label: 'Green dot' },
  { code: 'dot_amber', label: 'Amber dot' },
  { code: 'dot_red', label: 'Red dot' },
  { code: 'none', label: 'No highlight' },
];

type Props = {
  bookingId: string;
  highlightCode: BookingHighlightCode;
  effectiveHighlightCode: BookingHighlightCode;
  onSelect: (bookingId: string, code: BookingHighlightCode) => void;
};

function BookingHighlightPicker({
  bookingId,
  highlightCode,
  effectiveHighlightCode,
  onSelect,
}: Props) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex focus:outline-none hover:opacity-80 cursor-pointer min-w-[20px] min-h-[20px] rounded"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <BookingHighlightIcon highlightCode={effectiveHighlightCode} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[100] bg-white border border-gray-200 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {OPTIONS.map(({ code, label }) => (
          <DropdownMenuItem
            key={code}
            onSelect={(e) => {
              e.preventDefault();
              onSelect(bookingId, code);
            }}
            className="flex items-center gap-2"
          >
            <BookingHighlightIcon highlightCode={code} />
            <span>{label}</span>
            {(code === 'none' ? effectiveHighlightCode === 'none' : highlightCode === code) && (
              <span className="ml-auto">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default memo(BookingHighlightPicker);

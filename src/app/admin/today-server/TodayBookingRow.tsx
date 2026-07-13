'use client';

import React, { memo, useMemo } from 'react';
import { KeyRound } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookingHighlightIcon } from '@/components/bookings/BookingHighlightIcon';
import BookingHighlightPicker from './BookingHighlightPicker';
import { cn } from '@/lib/utils';
import {
  GATE_STATUS,
  GATE_STATUS_OPTIONS,
  gateStatusLabel,
  gateStatusPillClass,
} from '@/lib/gateStatus';
import { BookingHighlightCode } from '@/types/bookings';
import { formatBookingDateTimeForTenant } from '@/lib/datetime/parse';
import { departureFlightDisplay } from '@/lib/ops/parkedState';

export type TodayOpsAction =
  | 'reserved'
  | 'arrived'
  | 'arrived_key_taken'
  | 'take_key'
  | 'departed'
  | 'no_show'
  | 'cancelled';

export type TodayBoardBooking = {
  id: string;
  reference: string;
  customer_name: string | null;
  customer_phone?: string | null;
  plate: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  flight_number?: string | null;
  return_flight_number?: string | null;
  gate_status?: string | null;
  highlight_code?: BookingHighlightCode | null;
  ops_hidden?: boolean | null;
  ops_hidden_reason?: string | null;
  is_incomplete?: boolean;
};

type BoardSection = 'arrivals' | 'departures' | 'parked';

function getRowStyleClasses(
  b: { gate_status?: string | null },
  section: BoardSection | undefined,
  gateStatusOverride?: string | null
): string {
  const s = gateStatusOverride ?? b.gate_status;
  const isTakeKey = s === 'take_key';
  const isArrivedKeyTaken = s === 'arrived_key_taken';
  let rowBg = 'bg-white';
  let text = 'text-black';

  if (section === 'arrivals') {
    if (s === 'no_show' || s === 'cancelled') {
      rowBg = 'bg-red-600';
      text = 'text-black [&_*]:!text-black';
    } else if (isArrivedKeyTaken) {
      rowBg = 'bg-yellow-400';
      text = 'text-red-600 [&_*]:!text-red-600';
    } else if (isTakeKey) {
      rowBg = 'bg-yellow-400';
      text = 'text-black [&_*]:!text-black';
    } else if (s === 'arrived') {
      rowBg = 'bg-white';
      text = 'text-red-600';
    }
  } else if (section === 'departures') {
    if (s === 'no_show') {
      rowBg = 'bg-red-600';
      text = 'text-black [&_*]:!text-black';
    } else if (isArrivedKeyTaken) {
      rowBg = 'bg-yellow-400';
      text = 'text-red-600 [&_*]:!text-red-600';
    } else if (isTakeKey) {
      rowBg = 'bg-yellow-400';
      text = 'text-black [&_*]:!text-black';
    } else {
      rowBg = 'bg-green-600';
      text = 'text-black';
    }
  } else if (section === 'parked' || section === undefined) {
    if (s === 'no_show') {
      rowBg = 'bg-red-600';
      text = 'text-black [&_*]:!text-black';
    } else if (isArrivedKeyTaken) {
      rowBg = 'bg-yellow-400';
      text = 'text-red-600 [&_*]:!text-red-600';
    } else if (isTakeKey) {
      rowBg = 'bg-yellow-400';
      text = 'text-black [&_*]:!text-black';
    }
  }

  return `${rowBg} ${text}`;
}

function PlateBadge({ plate }: { plate: string | null | undefined }) {
  const value = (plate || '').trim().toUpperCase() || '—';
  return (
    <span className="inline-flex max-w-[9rem] shrink-0 items-center justify-center whitespace-nowrap rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-sm font-semibold uppercase tracking-wider text-gray-900">
      {value}
    </span>
  );
}

function PhoneCell({ phone }: { phone?: string | null }) {
  const value = (phone || '').trim();
  if (!value) return <span className="text-sm text-gray-500">—</span>;
  return (
    <a
      href={`tel:${value.replace(/\s+/g, '')}`}
      className="text-sm text-blue-700 underline-offset-2 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {value}
    </a>
  );
}

function timeOnlyLabel(timestamp: string, timezone: string): string {
  const full = formatBookingDateTimeForTenant({ timestamp, timezone });
  // format is "dd MMM, HH:mm" — prefer clock time when available
  const parts = full.split(', ');
  return parts.length > 1 ? parts[parts.length - 1] : full;
}

export type TodayBookingRowProps = {
  booking: TodayBoardBooking;
  section?: BoardSection;
  timezone: string;
  highlightMode: boolean;
  showHidden?: boolean;
  isSelected: boolean;
  isPending: boolean;
  onBookingClick: (bookingId: string) => void;
  onUnhide?: (booking: TodayBoardBooking) => void;
  onSelectChange: (bookingId: string, checked: boolean) => void;
  onQuickAction: (bookingId: string, action: TodayOpsAction) => void;
  onHighlightSelect: (bookingId: string, code: BookingHighlightCode) => void;
};

function TodayBookingRow({
  booking,
  section,
  timezone,
  highlightMode,
  showHidden,
  isSelected,
  isPending,
  onBookingClick,
  onUnhide,
  onSelectChange,
  onQuickAction,
  onHighlightSelect,
}: TodayBookingRowProps) {
  const timeField = section === 'departures' ? booking.end_at : booking.start_at;
  const timeLabel = useMemo(
    () => timeOnlyLabel(timeField, timezone),
    [timeField, timezone]
  );
  const flightLabel =
    section === 'departures'
      ? departureFlightDisplay(booking)
      : (booking.flight_number || '').trim() || '—';

  const isKeyTaken = Boolean(
    booking.gate_status === GATE_STATUS.TAKE_KEY ||
      booking.gate_status === GATE_STATUS.ARRIVED_KEY_TAKEN ||
      booking.highlight_code === 'key'
  );
  const effectiveHighlightCode: BookingHighlightCode = isKeyTaken
    ? 'key'
    : booking.highlight_code || 'none';
  const displayGateStatus = booking.gate_status ?? GATE_STATUS.RESERVED;

  const rowClass = cn(
    'group border-b transition-colors',
    highlightMode && 'cursor-pointer',
    getRowStyleClasses(booking, section, displayGateStatus)
  );

  const handleRowClick = () => {
    if (!highlightMode) onBookingClick(booking.id);
  };

  const handleGateStatusChange = (value: string) => {
    if (value === GATE_STATUS.NONE) return;
    onQuickAction(booking.id, value as TodayOpsAction);
  };

  const handleQuickKey = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,input,select,textarea,[role='button']")) return;
    const key = event.key.toLowerCase();
    if (key === 'a' && section !== 'departures') {
      event.preventDefault();
      handleGateStatusChange(GATE_STATUS.ARRIVED);
    } else if (key === 'k' && section !== 'departures') {
      event.preventDefault();
      handleGateStatusChange(GATE_STATUS.ARRIVED_KEY_TAKEN);
    } else if (key === 'd') {
      event.preventDefault();
      handleGateStatusChange(GATE_STATUS.DEPARTED);
    }
  };

  const statusSelect = (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Select
        value={displayGateStatus === '' ? undefined : displayGateStatus}
        onValueChange={handleGateStatusChange}
        disabled={isPending}
      >
        <SelectTrigger className="h-7 px-1 py-0 bg-transparent border-0 shadow-none gap-1 cursor-pointer focus:ring-0 focus:ring-offset-0 min-w-0 w-auto [&>svg]:shrink-0 [&>span:first-of-type]:sr-only">
          <SelectValue />
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none text-inherit',
              gateStatusPillClass(displayGateStatus)
            )}
          >
            {gateStatusLabel(displayGateStatus)}
          </span>
        </SelectTrigger>
        <SelectContent align="end" className="z-[100]">
          {GATE_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {booking.ops_hidden && showHidden && onUnhide && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onUnhide(booking);
          }}
        >
          Unhide
        </Button>
      )}
      {isPending && <span className="text-xs text-blue-800">Saving…</span>}
    </div>
  );

  return (
    <>
      {/* Desktop row */}
      <tr className={cn(rowClass, 'hidden md:table-row')} tabIndex={0} onKeyDown={handleQuickKey}>
        <td className="whitespace-nowrap px-2 py-2 text-sm align-middle cursor-pointer" onClick={handleRowClick}>
          <div className="flex items-center gap-2">
            <span
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex items-center"
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelectChange(booking.id, checked === true)}
                aria-label={`Select booking ${booking.reference}`}
                className="bg-white border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            </span>
            <span className="font-medium tabular-nums">{timeLabel}</span>
          </div>
        </td>
        <td className="px-2 py-2 text-sm align-middle cursor-pointer" onClick={handleRowClick}>
          <div className="flex items-center gap-1.5 min-w-0">
            {isKeyTaken && <KeyRound className="h-4 w-4 shrink-0" />}
            {highlightMode ? (
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="inline-flex"
              >
                <BookingHighlightPicker
                  bookingId={booking.id}
                  highlightCode={effectiveHighlightCode}
                  effectiveHighlightCode={effectiveHighlightCode}
                  onSelect={onHighlightSelect}
                />
              </div>
            ) : !isKeyTaken ? (
              <BookingHighlightIcon highlightCode={effectiveHighlightCode} />
            ) : null}
            <span className="truncate">{booking.customer_name || '—'}</span>
          </div>
        </td>
        <td className="px-2 py-2 align-middle cursor-pointer" onClick={handleRowClick}>
          <PlateBadge plate={booking.plate} />
        </td>
        <td className="px-2 py-2 align-middle whitespace-nowrap">
          <PhoneCell phone={booking.customer_phone} />
        </td>
        <td className="px-2 py-2 text-sm align-middle cursor-pointer whitespace-nowrap" onClick={handleRowClick}>
          {flightLabel}
        </td>
        <td className="px-2 py-2 align-middle">{statusSelect}</td>
      </tr>

      {/* Mobile card-style row */}
      <tr className={cn(rowClass, 'md:hidden')} tabIndex={0} onKeyDown={handleQuickKey}>
        <td colSpan={6} className="px-3 py-3 align-middle" onClick={handleRowClick}>
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.preventDefault()}
                  className="inline-flex"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => onSelectChange(booking.id, checked === true)}
                    aria-label={`Select booking ${booking.reference}`}
                    className="bg-white border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </span>
                <div className="min-w-0">
                  <div className="font-medium truncate">{booking.customer_name || '—'}</div>
                  <div className="text-xs opacity-80">{timeLabel}</div>
                </div>
              </div>
              <PlateBadge plate={booking.plate} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <PhoneCell phone={booking.customer_phone} />
              <span>{section === 'departures' ? 'Return: ' : 'Flight: '}{flightLabel}</span>
            </div>
            {statusSelect}
          </div>
        </td>
      </tr>
    </>
  );
}

export default memo(TodayBookingRow);

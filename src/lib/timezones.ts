/**
 * Timezone utilities and curated timezone list
 */

import { TIMEZONE_OPTIONS } from '@/lib/constants';

export type TimezoneOption = {
  value: string;
  label: string;
};

/**
 * Get all available timezone options
 */
export function getTimezoneOptions(): TimezoneOption[] {
  return TIMEZONE_OPTIONS;
}

/**
 * Get timezone option by value
 */
export function getTimezoneOption(value: string): TimezoneOption | undefined {
  return TIMEZONE_OPTIONS.find(option => option.value === value);
}

/**
 * Get default timezone
 */
export function getDefaultTimezone(): string {
  return 'Europe/London';
}

/**
 * Validate if a timezone is supported
 */
export function isValidTimezone(timezone: string): boolean {
  return TIMEZONE_OPTIONS.some(option => option.value === timezone);
}

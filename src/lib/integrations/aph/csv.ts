// APH B.1 CSV rate export generator
// Pure function - no SFTP, no network, no database writes

import { format } from 'date-fns';
import type {
  AphChannelConfig,
  AphProductMapping,
  AphRatesCsvResult,
  PricingEngine,
} from './types';

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * B.1 CSV row structure
 */
type AphB1Row = {
  Product: string;
  ValidFromDate: string;  // YYYY-MM-DD
  ArrivalDate: string;     // YYYY-MM-DD
  LengthOfStay: number;
  Price: string;          // formatted to 2 decimal places, e.g. "123.45" or "999"
};

/**
 * Generate APH B.1 rates CSV file
 * Pure function - takes config and pricing engine, returns CSV
 * 
 * @param params - Configuration and dependencies
 * @returns CSV content, filename, and row count
 */
export async function generateAphB1RatesCsv(params: {
  tenantId: string;
  config: AphChannelConfig;
  products: AphProductMapping[];
  pricingEngine: PricingEngine;
  now?: Date; // for testability
}): Promise<AphRatesCsvResult> {
  const { tenantId, config, products, pricingEngine, now } = params;

  // Input validation
  if (!products || products.length === 0) {
    throw new Error('Products array cannot be empty');
  }

  if (config.daysAhead < 0) {
    throw new Error('daysAhead cannot be negative');
  }

  if (config.daysAhead > 730) {
    throw new Error('daysAhead cannot exceed 730 days (2 years)');
  }

  // Determine validFromDate
  let validFromDate: string;
  if (config.validFromDate) {
    // Validate format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(config.validFromDate)) {
      throw new Error('validFromDate must be in YYYY-MM-DD format');
    }
    validFromDate = config.validFromDate;
  } else {
    // Use today in UTC
    const today = now || new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    validFromDate = format(utcToday, 'yyyy-MM-dd');
  }

  // Determine date range: today to today + daysAhead (inclusive)
  const today = now || new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const arrivalDates: Date[] = [];
  for (let i = 0; i <= config.daysAhead; i++) {
    const date = new Date(utcToday);
    date.setUTCDate(date.getUTCDate() + i);
    arrivalDates.push(date);
  }

  // Build rows array
  const rows: AphB1Row[] = [];

  // For each product
  for (const product of products) {
    // For each arrival date
    for (const arrivalDate of arrivalDates) {
      // Format as YYYY-MM-DD in UTC
      const arrivalDateStr = format(arrivalDate, 'yyyy-MM-dd');

      // Track if LOS 1 was a closeout (for LOS 31 logic)
      let los1Closeout = false;
      let los1Price: number | null = null;

      // For each length of stay from 1 to 30
      for (let lengthOfStay = 1; lengthOfStay <= 30; lengthOfStay++) {
        const priceResult = await pricingEngine.getPrice({
          tenantId,
          internalProductId: product.internalProductId,
          arrivalDate,
          lengthOfStay,
        });

        let priceStr: string;
        const isCloseout = priceResult.isCloseout === true || priceResult.totalPrice === null;

        if (isCloseout) {
          priceStr = '999';
          if (lengthOfStay === 1) {
            los1Closeout = true;
          }
        } else {
          const price = priceResult.totalPrice!;
          // Round to 2 decimal places
          priceStr = price.toFixed(2);
          if (lengthOfStay === 1) {
            los1Price = price;
          }
        }

        rows.push({
          Product: product.productCode,
          ValidFromDate: validFromDate,
          ArrivalDate: arrivalDateStr,
          LengthOfStay: lengthOfStay,
          Price: priceStr,
        });
      }

      // Handle LOS = 31 (extra-day)
      // Rule: reuse the 1-day price for the same arrivalDate as the extra-day rate
      // If there was a closeout for LOS 1, then LOS 31 should also be a closeout
      let los31PriceStr: string;
      if (los1Closeout) {
        los31PriceStr = '999';
      } else if (los1Price !== null) {
        // Use the 1-day price as the extra-day rate
        los31PriceStr = los1Price.toFixed(2);
      } else {
        // Fallback: if somehow we don't have LOS 1 data, treat as closeout
        los31PriceStr = '999';
      }

      rows.push({
        Product: product.productCode,
        ValidFromDate: validFromDate,
        ArrivalDate: arrivalDateStr,
        LengthOfStay: 31,
        Price: los31PriceStr,
      });
    }
  }

  // Build CSV string
  const header = 'Product,ValidFromDate,ArrivalDate,LengthOfStay,Price';
  const csvLines = [header];

  for (const row of rows) {
    csvLines.push(
      `${row.Product},${row.ValidFromDate},${row.ArrivalDate},${row.LengthOfStay},${row.Price}`
    );
  }

  const csv = csvLines.join('\n');

  // Generate filename: APH_YYYYMMDDHHMMSS.csv
  const timestampDate = now || new Date();
  // Use UTC for filename timestamp
  const utcTimestamp = new Date(Date.UTC(
    timestampDate.getUTCFullYear(),
    timestampDate.getUTCMonth(),
    timestampDate.getUTCDate(),
    timestampDate.getUTCHours(),
    timestampDate.getUTCMinutes(),
    timestampDate.getUTCSeconds()
  ));
  const timestamp = format(utcTimestamp, 'yyyyMMddHHmmss');
  const filename = `APH_${timestamp}.csv`;

  return {
    filename,
    csv,
    rowsCount: rows.length,
  };
}

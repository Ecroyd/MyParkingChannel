// Adapter that wraps the real pricing engine into the PricingEngine interface

import { createAdminClient } from '@/lib/supabase/server';
import { calculateProductAvailability } from '@/lib/availability/product';
import type { PricingEngine } from './types';

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Real pricing engine adapter that uses the existing availability/pricing system
 */
export const realPricingEngine: PricingEngine = {
  async getPrice({ tenantId, internalProductId, arrivalDate, lengthOfStay }) {
    try {
      // Calculate end date based on arrival date and length of stay
      const startAt = new Date(arrivalDate);
      startAt.setUTCHours(0, 0, 0, 0);

      const endAt = new Date(startAt);
      endAt.setUTCDate(endAt.getUTCDate() + lengthOfStay);

      // Call the real pricing logic
      const availability = await calculateProductAvailability({
        tenantId,
        productId: internalProductId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        currency: 'GBP',
        channelCode: 'agent', // Use agent channel for APH exports
      });

      // Determine if this is a closeout
      const isCloseout =
        availability.availabilityStatus === 'closed' ||
        availability.availabilityStatus === 'sold_out';

      // Return the total price (includes VAT, fees, dynamic pricing, etc.)
      return {
        totalPrice: isCloseout ? null : availability.pricing.totalPrice,
        isCloseout,
      };
    } catch (error: any) {
      // If pricing calculation fails, treat as closeout
      console.error(
        `[APH Pricing Engine] Failed to get price for product ${internalProductId}, arrival ${arrivalDate.toISOString()}, LOS ${lengthOfStay}:`,
        error
      );
      return {
        totalPrice: null,
        isCloseout: true,
      };
    }
  },
};


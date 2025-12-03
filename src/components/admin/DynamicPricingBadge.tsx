'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Settings } from 'lucide-react';
import Link from 'next/link';

export function DynamicPricingBadge() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkDynamicPricing() {
      try {
        const response = await fetch('/api/admin/dynamic-pricing/settings', {
          credentials: 'include',
        });
        const data = await response.json();
        setIsEnabled(data.is_enabled || false);
      } catch (error) {
        console.error('Error checking dynamic pricing status:', error);
      } finally {
        setLoading(false);
      }
    }

    checkDynamicPricing();
  }, []);

  if (loading || !isEnabled) {
    return null;
  }

  return (
    <Link href="/admin/settings/dynamic-pricing">
      <Badge
        variant="secondary"
        className="bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer flex items-center gap-1"
        title="Dynamic pricing is enabled. Prices may be increased when capacity is high."
      >
        <Settings className="h-3 w-3" />
        Dynamic Pricing ON
      </Badge>
    </Link>
  );
}


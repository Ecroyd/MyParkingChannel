'use client';

import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

interface DynamicPricingBadgeProps {
  multiplier?: number | null;
  occupancyPercent?: number | null;
  ruleId?: string | null;
  applied?: boolean;
}

export function DynamicPricingBadge({
  multiplier,
  occupancyPercent,
  ruleId,
  applied,
}: DynamicPricingBadgeProps) {
  if (!applied || !multiplier) {
    return null;
  }

  // Calculate the percentage increase
  const increasePercent = ((multiplier - 1) * 100).toFixed(0);

  return (
    <Badge
      variant="secondary"
      className="bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1"
      title={
        occupancyPercent
          ? `Dynamic pricing applied: +${increasePercent}% (occupancy ${occupancyPercent.toFixed(1)}%)`
          : `Dynamic pricing applied: +${increasePercent}%`
      }
    >
      <TrendingUp className="h-3 w-3" />
      Dynamic +{increasePercent}%
    </Badge>
  );
}


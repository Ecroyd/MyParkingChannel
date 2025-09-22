'use client'

import { Badge } from '@/components/ui/badge'
import { Globe } from 'lucide-react'

interface DomainBadgeProps {
  domain: string
  isPrimary?: boolean
}

export function DomainBadge({ domain, isPrimary = false }: DomainBadgeProps) {
  return (
    <div className="flex items-center space-x-2">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <Badge variant={isPrimary ? "default" : "secondary"}>
        {domain}
      </Badge>
      {isPrimary && (
        <Badge variant="outline" className="text-xs">
          Primary
        </Badge>
      )}
    </div>
  )
}


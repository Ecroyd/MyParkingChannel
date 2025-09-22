import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function KpiCard({
  title, value, hint
}: { title: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="shadow-soft">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint ? <div className="text-xs text-gray-400 mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}


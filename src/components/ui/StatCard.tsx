type Props = {
  label: string
  value: string | number
  delta?: string
  variant?: 'default' | 'success' | 'danger' | 'info'
  rightSlot?: React.ReactNode
}
const VAR = {
  default: 'bg-white',
  success: 'bg-gradient-to-br from-blue-50 to-blue-100',
  danger:  'bg-danger-50',
  info:    'bg-info-50',
}
const CHIP = {
  success: 'badge badge-success',
  danger:  'badge badge-danger',
  info:    'badge badge-info',
}

export default function StatCard({ label, value, delta, variant='default', rightSlot }: Props) {
  return (
    <div className={`card ${VAR[variant]}`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="text-sm text-slate-500">{label}</div>
          {rightSlot}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="text-2xl font-semibold text-slate-900">{value}</div>
          {delta && variant !== 'default' && (
            <span className={CHIP[variant]}>{delta}</span>
          )}
        </div>
      </div>
    </div>
  )
}


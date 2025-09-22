export default function EmptyState({
  title, detail, action
}: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {detail ? <p className="text-sm text-gray-500">{detail}</p> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  )
}


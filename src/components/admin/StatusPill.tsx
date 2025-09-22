export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    reserved: 'bg-gray-100 text-gray-800',
    checked_in: 'bg-green-100 text-green-800',
    checked_out: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-red-100 text-red-800',
  }
  const cls = map[status] ?? 'bg-gray-100 text-gray-800'
  return <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${cls}`}>{status.replace('_',' ')}</span>
}


export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}
export function Th({ children, className = '' }: any) {
  return <th className={`px-3 py-2 text-left text-sm font-medium text-gray-600 ${className}`}>{children}</th>
}
export function Td({ children, className = '' }: any) {
  return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>
}


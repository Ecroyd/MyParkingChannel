export function SkeletonRows({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <tbody className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="bg-white">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-3 w-full max-w-[160px] animate-pulse rounded bg-gray-200" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}


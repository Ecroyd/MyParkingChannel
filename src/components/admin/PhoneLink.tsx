'use client'

export function PhoneLink({ phone }: { phone?: string | null }) {
  const value = phone?.trim()
  if (!value) {
    return <span className="text-slate-400">—</span>
  }
  const tel = value.replace(/[^\d+]/g, '')
  return (
    <a
      href={`tel:${tel}`}
      className="whitespace-nowrap text-blue-600 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {value}
    </a>
  )
}

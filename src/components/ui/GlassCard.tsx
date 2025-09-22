import { PropsWithChildren } from 'react'

export default function GlassCard({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={`card ${className}`}>{children}</section>
  )
}



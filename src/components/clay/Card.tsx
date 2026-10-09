import type { ReactNode } from 'react'

export function ClayCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card rounded-clay shadow-clay border-4 border-border p-6">
      {children}
    </div>
  )
}

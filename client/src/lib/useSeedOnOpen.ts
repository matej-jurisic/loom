import { useState } from 'react'

export function useSeedOnOpen(open: boolean, source: unknown, seed: () => void) {
  const [seen, setSeen] = useState<{ open: boolean; source: unknown }>({ open: false, source: undefined })

  if (open && (!seen.open || seen.source !== source)) {
    setSeen({ open: true, source })
    seed()
  } else if (!open && seen.open) {
    setSeen({ open: false, source })
  }
}

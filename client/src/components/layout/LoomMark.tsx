import rects from '@/lib/brandMark.json'

/**
 * Brand mark: a plain weave, warp and weft strands alternating over/under.
 * Used wherever "Loom" appears as a wordmark (sidebar, auth pages). The favicon and the native
 * app icon sources are generated from the same `lib/brandMark.json` by `npm run gen:brand`.
 * Fill-based (not stroke, unlike lucide icons) so it reads as a logo, not a UI icon.
 */
export function LoomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} {...r} />
      ))}
    </svg>
  )
}

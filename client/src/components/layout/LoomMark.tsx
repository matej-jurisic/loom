/**
 * Brand mark: a plain weave, warp and weft strands alternating over/under.
 * Used wherever "Loom" appears as a wordmark (sidebar, auth pages) and mirrored
 * in `public/favicon.svg` and the native app icon sources under `client/assets/`.
 * Fill-based (not stroke, unlike lucide icons) so it reads as a logo, not a UI icon.
 */
export function LoomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6.5" y="2" width="3" height="12.5" rx="1.5" />
      <rect x="6.5" y="17.5" width="3" height="4.5" rx="1.5" />
      <rect x="14.5" y="2" width="3" height="4.5" rx="1.5" />
      <rect x="14.5" y="9.5" width="3" height="12.5" rx="1.5" />
      <rect x="2" y="6.5" width="4.5" height="3" rx="1.5" />
      <rect x="9.5" y="6.5" width="12.5" height="3" rx="1.5" />
      <rect x="2" y="14.5" width="12.5" height="3" rx="1.5" />
      <rect x="17.5" y="14.5" width="4.5" height="3" rx="1.5" />
    </svg>
  )
}

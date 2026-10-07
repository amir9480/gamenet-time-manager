import { DynamicIcon, iconNames } from 'lucide-react/dynamic'

const KNOWN = new Set<string>(iconNames)

// Kept in its own file so the (large) Lucide name/loader map is only downloaded when a
// Lucide icon is actually shown. Falls back to nothing for names that no longer exist.
export default function AppIconLucide({ name, className }: { name: string; className?: string }) {
  if (!KNOWN.has(name)) return null
  return (
    <DynamicIcon
      name={name as (typeof iconNames)[number]}
      aria-hidden
      className={className}
      fallback={() => <span className={className} />}
    />
  )
}

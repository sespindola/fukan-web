import { useState, useEffect, useRef } from 'react'
import { useLayerStore, type LayerType } from '~/stores/layerStore'
import { useStreamStore } from '~/stores/streamStore'
import { useBgpEventStore } from '~/stores/bgpEventStore'
import { BasemapToggle } from '~/components/globe/controls/BasemapToggle'
import type { CurrentUser } from '~/types'

import FukanIconUrl from '~/assets/fukan-icon.svg'

interface SidebarProps {
  user?: CurrentUser | null
}

type CountKey = 'aircraft' | 'vessels' | 'satellites' | 'bgp'

const STREAM_KEY: Partial<Record<LayerType, CountKey>> = {
  aircraft: 'aircraft',
  vessel: 'vessels',
  satellite: 'satellites',
  bgp_node: 'bgp',
}

const LAYERS: { type: LayerType; label: string; color: string }[] = [
  { type: 'aircraft', label: 'Aircraft', color: 'bg-cyan-400' },
  { type: 'vessel', label: 'Vessels', color: 'bg-blue-400' },
  { type: 'satellite', label: 'Satellites', color: 'bg-violet-400' },
  { type: 'bgp_node', label: 'BGP Nodes', color: 'bg-amber-400' },
  { type: 'news', label: 'News', color: 'bg-pink-400' },
]

function Toggle({
  checked,
  onChange,
  color,
}: {
  checked: boolean
  onChange: () => void
  color: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
        checked ? color : 'bg-gray-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 translate-y-0.5 ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function userInitials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 text-white/40 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M2 4l4 4 4-4" />
    </svg>
  )
}

function SidebarSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="px-4 py-4">
      <button
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-center justify-between"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          {title}
        </h3>
        <ChevronIcon open={open} />
      </button>
      {open && children}
    </div>
  )
}

export function Sidebar({ user }: SidebarProps) {
  const layers = useLayerStore((s) => s.layers)
  const toggleLayer = useLayerStore((s) => s.toggleLayer)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    // Poll stream store sizes on a relaxed interval to avoid hot-path re-renders.
    // BGP events live in a separate bounded store with time-window eviction.
    const id = setInterval(() => {
      const s = useStreamStore.getState()
      const bgp = useBgpEventStore.getState().events.size
      setCounts({
        aircraft: s.aircraft.size,
        vessels: s.vessels.size,
        satellites: s.satellites.size,
        bgp,
      })
    }, 2000)
    return () => clearInterval(id)
  }, [])

  return (
    <aside className="flex h-full w-56 flex-col border-r border-white/10 bg-gray-950">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <img src={FukanIconUrl} alt="Fukan logo" className="h-6 w-6" />
        <span className="text-lg font-bold tracking-widest text-white">
          FUKAN
        </span>
      </div>

      {/* Collapsible sections */}
      <div className="flex-1 overflow-y-auto">
        <SidebarSection title="Layers">
          <ul className="space-y-1">
            {LAYERS.map(({ type, label, color }) => {
              const streamKey = STREAM_KEY[type]
              const count = streamKey ? counts[streamKey] : undefined
              return (
              <li key={type}>
                <label className="flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm text-white/80 transition-colors hover:bg-white/5">
                  <span className="flex items-center gap-2">
                    {label}
                    {count != null && count > 0 && (
                      <span className="text-[10px] tabular-nums text-white/40">{count.toLocaleString()}</span>
                    )}
                  </span>
                  <Toggle
                    checked={layers[type].visible}
                    onChange={() => toggleLayer(type)}
                    color={color}
                  />
                </label>
              </li>
              )
            })}
          </ul>
        </SidebarSection>

        <SidebarSection title="Basemap">
          <BasemapToggle />
        </SidebarSection>
      </div>

      {/* User */}
      <div ref={menuRef} className="relative border-t border-white/10 px-4 py-3">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-white/5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-medium text-white">
            {userInitials(user?.email ?? 'U')}
          </div>
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-medium text-white">
              {user?.email ?? 'Guest'}
            </p>
            <p className="truncate text-xs text-white/50 capitalize">
              {user?.role ?? ''}
            </p>
          </div>
        </button>

        {menuOpen && (
          <div className="absolute bottom-full left-4 mb-2 w-44">
            {/* Popover body */}
            <div className="rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/10">
              <a
                href="/settings"
                data-turbo="false"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Settings
              </a>
              <form action="/users/sign_out" method="post">
                <input type="hidden" name="_method" value="delete" />
                <input type="hidden" name="authenticity_token" value={document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''} />
                <button
                  type="submit"
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  Log out
                </button>
              </form>
            </div>
            {/* Caret */}
            <div className="ml-5 h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-white" />
          </div>
        )}
      </div>
    </aside>
  )
}

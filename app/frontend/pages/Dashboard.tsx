import { GlobeView } from '~/components/globe/GlobeView'
import { TimelineScrubber } from '~/components/globe/controls/TimelineScrubber'
import { Sidebar } from '~/components/Sidebar'
import type { DashboardProps } from '~/types/api'

export default function Dashboard({
  user,
}: DashboardProps) {
  return (
    <div className="flex h-screen w-screen bg-black">
      <Sidebar user={user} />
      <main className="relative flex-1">
        <GlobeView />
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <TimelineScrubber />
        </div>
      </main>
    </div>
  )
}

import { GlobeView } from '~/components/globe/GlobeView'
import { TimelineScrubber } from '~/components/globe/controls/TimelineScrubber'
import { FlashMessages } from '~/components/FlashMessages'
import { Sidebar } from '~/components/Sidebar'
import type { SharedProps } from '~/types'

export default function Dashboard({ current_user }: SharedProps) {
  return (
    <div className="flex h-screen w-screen bg-black">
      <Sidebar user={current_user} />
      <main className="relative flex-1">
        <GlobeView />
        <FlashMessages />
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <TimelineScrubber />
        </div>
      </main>
    </div>
  )
}

import { useTimelineStore } from '~/stores/timelineStore'
import { useStreamStore } from '~/stores/streamStore'

const STATUS_COLORS = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-500 animate-pulse',
  disconnected: 'bg-red-500',
} as const

export function TimelineScrubber() {
  const mode = useTimelineStore((s) => s.mode)
  const playing = useTimelineStore((s) => s.playing)
  const speed = useTimelineStore((s) => s.speed)
  const togglePlay = useTimelineStore((s) => s.togglePlay)
  const goLive = useTimelineStore((s) => s.goLive)
  const setSpeed = useTimelineStore((s) => s.setSpeed)
  const connectionStatus = useStreamStore((s) => s.connectionStatus)

  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-900/80 px-4 py-2 text-sm text-white backdrop-blur">
      <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[connectionStatus]}`} title={`Stream: ${connectionStatus}`} />
      {mode === 'live' ? (
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          LIVE
        </span>
      ) : (
        <>
          <button onClick={togglePlay} className="hover:text-cyan-400">
            {playing ? 'Pause' : 'Play'}
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-transparent"
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
            <option value={10}>10x</option>
          </select>
          <button onClick={goLive} className="hover:text-cyan-400">
            Go Live
          </button>
        </>
      )}
    </div>
  )
}

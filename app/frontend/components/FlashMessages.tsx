import { useState, useEffect } from 'react'
import { usePage } from '@inertiajs/react'
import type { SharedProps } from '~/types'

export function FlashMessages() {
  const { flash } = usePage<SharedProps>().props
  const [visible, setVisible] = useState<{ notice?: string; alert?: string }>({})

  useEffect(() => {
    setVisible({ notice: flash?.notice, alert: flash?.alert })
    if (flash?.notice || flash?.alert) {
      const timer = setTimeout(() => setVisible({}), 5000)
      return () => clearTimeout(timer)
    }
  }, [flash?.notice, flash?.alert])

  if (!visible.notice && !visible.alert) return null

  return (
    <div className="absolute top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {visible.notice && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/25 px-4 py-2.5 text-sm text-emerald-400 backdrop-blur">
          <span>{visible.notice}</span>
          <button onClick={() => setVisible((v) => ({ ...v, notice: undefined }))} className="ml-2 text-emerald-400/60 hover:text-emerald-400">&times;</button>
        </div>
      )}
      {visible.alert && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-500/15 border border-rose-500/25 px-4 py-2.5 text-sm text-rose-400 backdrop-blur">
          <span>{visible.alert}</span>
          <button onClick={() => setVisible((v) => ({ ...v, alert: undefined }))} className="ml-2 text-rose-400/60 hover:text-rose-400">&times;</button>
        </div>
      )}
    </div>
  )
}

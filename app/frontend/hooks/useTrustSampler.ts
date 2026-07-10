import { useEffect } from 'react'
import { useTrustStore } from '~/stores/trustStore'

const SAMPLE_INTERVAL_MS = 2_000

export function useTrustSampler(): void {
  useEffect(() => {
    useTrustStore.getState().refreshSnapshot()
    const id = window.setInterval(() => {
      useTrustStore.getState().refreshSnapshot()
    }, SAMPLE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [])
}

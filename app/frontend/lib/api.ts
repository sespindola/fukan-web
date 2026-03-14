import { router } from '@inertiajs/react'

export const visit = (url: string) => router.visit(url)
export const reload = () => router.reload()

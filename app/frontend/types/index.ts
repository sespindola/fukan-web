export type FlashData = {
  notice?: string
  alert?: string
}

export type CurrentUser = {
  id: number
  email: string
  role: string | null
}

export type SharedProps = {
  flash: FlashData
  current_user: CurrentUser | null
}

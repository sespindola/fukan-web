declare module '@rails/actioncable' {
  export interface Subscription {
    unsubscribe(): void
    perform(action: string, data?: Record<string, unknown>): void
    send(data: Record<string, unknown>): void
  }

  export interface Subscriptions {
    create(
      channel: string | Record<string, unknown>,
      mixin?: {
        connected?(): void
        disconnected?(): void
        received?(data: unknown): void
        rejected?(): void
      },
    ): Subscription
  }

  export interface Consumer {
    subscriptions: Subscriptions
  }

  export function createConsumer(url?: string): Consumer
}

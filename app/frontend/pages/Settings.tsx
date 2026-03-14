import type { SharedProps } from '~/types/api'

export default function Settings({ user, organization }: SharedProps) {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-2xl font-bold text-white">Settings</h1>
      <div className="rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Organization</h2>
        <p className="text-gray-400">{organization.name}</p>
      </div>
    </div>
  )
}

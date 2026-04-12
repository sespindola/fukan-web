# AGENTS.md — Fukan Web Application

> AI coding assistant context file for the Rails + React web layer.
> Read fully before generating any code.
> Last updated: 2026-04-12

---

## Conflict Resolution

If any guidance in this file conflicts with the invariants or non-goals listed below, **the invariants and non-goals win**. When in doubt: simpler is right, complexity needs justification.

---

## TL;DR — Critical Invariants

**Read this section even if you read nothing else.**

### What Fukan Is

A real-time, open-source global OSINT platform that collates telemetry feeds (ADS-B, AIS, satellite orbits, BGP routing, geolocated news) onto an interactive 3D globe. Think "Palantir for everyone" — democratized intelligence visualization.

### What This Repo Is

The **web application layer** — auth, UI, configuration, ClickHouse reads, and real-time streaming to the browser. This repo does NOT handle data ingestion — that is a separate Go codebase (see `fukan-ingest`).

### Core Loop (everything serves this)

```
User opens Fukan → Rails authenticates via Devise →
  Inertia renders React page with initial props →
  React initializes CesiumJS globe (via resium <Viewer>) →
  AnyCable streams live telemetry filtered by viewport →
  Zustand stores manage client state →
  CesiumJS renders assets on globe imperatively (Primitive API)
```

### Product Non-Goals (never implement these)

- ❌ Satellite imagery or tasking — orbits, ground tracks, and coverage cones only
- ❌ PII storage from social/news feeds — aggregate only (token density per H3 cell)
- ❌ Raw data redistribution — BYOD (Bring Your Own Data/API Key) model for commercial feeds
- ❌ Custom per-user dashboards in v1 — one shared globe view per org
- ❌ Mobile native app in v1 — web only, mobile is a future consideration
- ❌ User-uploaded geospatial layers in v1 — system-provided feeds only

### Technical Non-Goals (never use these)

- ❌ Jbuilder / Jb → Use `alba_inertia` for Inertia responses and Alba (with OJ) for standalone JSON API endpoints
- ❌ Rails credentials/secrets → Use environment variables exclusively
- ❌ Turbo Streams/Hotwire → Inertia + React owns the frontend entirely
- ❌ ERB views for UI → All UI is React via Inertia; Rails views are only the Inertia shell
- ❌ Business logic in controllers → Use service objects
- ❌ Routes nested > 2 levels → Use shallow nesting
- ❌ Skip tests → Every feature needs specs (Rails) and tests (React)
- ❌ localStorage/sessionStorage in React → Use Zustand for all client state
- ❌ PostGIS for telemetry → ClickHouse with H3 indexing
- ❌ Mapbox GL JS / MapLibre GL JS → Use CesiumJS + resium with Cesium Ion
- ❌ MobX/Redux → Use Zustand for client state management
- ❌ React re-renders for live telemetry → Imperative CesiumJS Primitive API updates

### Data Separation Rule

```
PostgreSQL = auth, users, orgs, config, saved views, alerts (small, relational)
ClickHouse = ALL telemetry data (massive, append-only, time-series, READ-ONLY from Rails)
```

**Never store telemetry in PostgreSQL. Never store user/auth data in ClickHouse.**
**Rails never writes to ClickHouse. The Go ingest pipeline owns all ClickHouse writes.**
**ClickHouse is configured with `database_tasks: false` in `database.yml` — Rails skips it for `db:create`, `db:migrate`, `db:schema:load`, and all other database tasks. Schema is managed entirely by `fukan-ingest` (see `scripts/clickhouse-init.sql`).**

### Multi-Tenancy Rule

```ruby
# Users access data through their organization. No exceptions.
user.organization           # ← tenant root
user.organization.api_key_configs  # ← BYOD keys scoped to org
user.organization.saved_views      # ← through user association
```

---

## Architecture Overview

### System Context

```
┌─────────────────────────────────────────────────────────────────┐
│  fukan-ingest (Go, separate repo)                            │
│  Writes telemetry to ClickHouse + publishes to Redis pub/sub    │
└──────────────────────┬──────────────────────┬───────────────────┘
                       │                      │
                  ClickHouse              Redis pub/sub
                  (telemetry)         (live positions by H3)
                       │                      │
┌──────────────────────┼──────────────────────┼───────────────────┐
│  fukan-web (this repo)                   │                   │
│                      │                      │                   │
│  React/CesiumJS ◄══ Inertia ══► Rails 8     │                   │
│       ▲                          │          │                   │
│       │                          ▼          │                   │
│       │                     PostgreSQL      │                   │
│       │                  (users/orgs/config) │                   │
│       │                                     │                   │
│       ◄═══ AnyCable (WebSocket) ◄═══════════┘                   │
│                                                                 │
│  Sidekiq ◄──── Redis (job queue)                                │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flows

**Page load (Inertia):**
```
Browser → Rails router → Controller (auth via Devise) →
  Query PostgreSQL (user/org data) +
  Query ClickHouse (telemetry for initial viewport) →
  Render Inertia response (JSON props) →
  React component hydrates with props → CesiumJS renders globe
```

**Live telemetry (WebSocket):**
```
Go ingest pipeline publishes to Redis (keyed by H3 cell)
  → AnyCable subscribes to Redis channels
  → AnyCable pushes to connected React clients filtered by viewport H3 cells
  → Zustand streamStore receives update
  → CesiumJS primitives updated imperatively (NOT through React render cycle)
```

**Background job:**
```
Rails enqueues job → Sidekiq picks up → Service object executes →
  May query ClickHouse, write to PostgreSQL, or publish to Redis
```

---

## Domain Model

### PostgreSQL Entities

```
Organization (tenant root)
├── has_many :users
├── has_many :api_key_configs     # BYOD keys (Shodan, MarineTraffic, etc.)
├── has_many :alerts
└── has_one  :subscription        # Stripe billing (future)

User
├── belongs_to :organization
├── has_many :saved_views
└── has_many :alerts

ApiKeyConfig
├── belongs_to :organization
├── provider    String            # 'shodan', 'marinetraffic', 'adsb_exchange'
├── api_key     String (encrypted)
└── active      Boolean

SavedView
├── belongs_to :user
├── name        String
├── center      Array [lon, lat]
├── zoom        Float
├── layers      JSONB             # { aircraft: true, vessels: true, ... }
└── timeline    JSONB             # { mode: 'live' } or { mode: 'replay', ts: ... }

Alert
├── belongs_to :user
├── belongs_to :organization
├── trigger     String            # asset_enters_zone, asset_disappears, bgp_event, news
├── config      JSONB             # zone polygon, asset filters, thresholds
├── active      Boolean
└── last_fired_at DateTime
```

### ClickHouse Tables (READ-ONLY from Rails)

These tables are created and written to by the Go ingest pipeline. Rails only reads from them.

```
telemetry_latest (ReplacingMergeTree)
├── asset_id      String          — MMSI, ICAO hex, NORAD ID, ASN
├── asset_type    LowCardinality(String) — 'aircraft', 'vessel', 'satellite', 'bgp_node'
├── timestamp     DateTime
├── lat           Int32           — latitude * 10_000_000
├── lon           Int32           — longitude * 10_000_000
├── alt           Int32           — meters
├── speed         Float32
├── heading       Float32
├── h3_cell       UInt64          — H3 resolution 7
├── metadata      String          — JSON blob
├── source        LowCardinality(String)
└── ORDER BY (asset_type, asset_id)
    → Most recent ping per asset. Use for "Live Map" queries.

telemetry_raw (MergeTree)
├── Same columns as telemetry_latest
├── ORDER BY (asset_type, asset_id, timestamp)
├── PARTITION BY toYYYYMMDD(timestamp)
└── Full history. Use for timeline replay and asset history queries.

telemetry_h3_agg (AggregatingMergeTree)
├── h3_cell       UInt64
├── asset_type    LowCardinality(String)
├── time_bucket   DateTime        — toStartOfFiveMinutes(timestamp)
├── count         AggregateFunction(count)
└── Aggregated density. Use for zoomed-out heatmap views.
```

### Key Enums & Constants

| Domain    | Field       | Values                                                        |
|-----------|-------------|---------------------------------------------------------------|
| Asset     | asset_type  | `aircraft`, `vessel`, `satellite`, `bgp_node`                 |
| Aircraft  | squawk      | `7500` (hijack), `7600` (comms), `7700` (emergency)           |
| Vessel    | nav_status  | `under_way`, `at_anchor`, `moored`, `aground`, `not_defined`  |
| Satellite | status      | `active`, `maneuvering`, `decaying`, `deorbited`              |
| BGP       | event_type  | `announcement`, `withdrawal`, `hijack`, `leak`                |
| Alert     | trigger     | `asset_enters_zone`, `asset_disappears`, `bgp_event`, `news`  |

### Coordinate Decoding (Int32 → Float)

```ruby
# ClickHouse stores lat/lon as Int32 * 10_000_000
# Always convert when passing to frontend
def decode_coord(int_val)
  int_val / 10_000_000.0
end
```

```typescript
// Frontend equivalent
const decodeLat = (v: number): number => v / 10_000_000
const decodeLon = (v: number): number => v / 10_000_000
```

---

## Tech Stack

| Component          | Choice                       | Notes                                         |
|--------------------|------------------------------|-----------------------------------------------|
| Framework          | Rails 8, Ruby 3.3+           | Auth, config, ClickHouse reads                |
| Frontend bridge    | InertiaJS (inertia_rails gem)| Controllers → React components as props       |
| Frontend           | React 19 + TypeScript        | Strict TypeScript, no `any` types             |
| Globe/Map          | CesiumJS + resium            | True 3D globe, Cesium Ion for terrain + imagery |
| Map tiles          | Cesium Ion (Bing Maps Aerial)| Ion default imagery provider                  |
| Terrain            | Cesium Ion World Terrain     | 3D terrain for surface clamping               |
| Client state       | Zustand                      | Separate stores per concern                   |
| CSS                | Tailwind CSS 4               | Utility-first, no component library           |
| Icons              | Lucide React                 | Consistent icon set                           |
| Charts             | Recharts                     | Timeline and analytics panels                 |
| Auth               | Devise + OmniAuth            | Google OAuth2, TOTP, Argon2 passwords         |
| WebSockets         | AnyCable                     | Go-based WS server, ActionCable-compatible    |
| Background jobs    | Sidekiq + Redis              | Job orchestration, scheduled tasks            |
| ClickHouse reads   | clickhouse-activerecord      | ActiveRecord-like syntax for telemetry queries|
| Serialization      | Alba + OJ + alba_inertia     | Alba for all serialization; alba_inertia integrates with Inertia props; OJ for fast JSON |
| Tests (Rails)      | RSpec + FactoryBot           | Request specs, model specs, service specs     |
| Tests (React)      | Vitest + Testing Library     | Component, store, and hook tests              |
| E2E tests          | Playwright                   | Critical flows: login → globe → interact      |

### Secrets

Environment variables only. Use dotenv in development. **Never Rails credentials.**

---

## Rails Application Structure

```
app/
├── channels/
│   └── telemetry_channel.rb        # AnyCable-compatible, viewport-filtered
├── controllers/
│   ├── application_controller.rb
│   ├── auth/                       # Devise overrides if needed
│   ├── dashboard_controller.rb     # Main globe view (Inertia)
│   ├── api/v1/                     # JSON API endpoints (Alba), if any
│   └── settings/                   # Org settings, API keys, alerts
├── jobs/                           # Sidekiq (orchestration only, no business logic)
│   ├── alert_evaluation_job.rb
│   └── feed_health_check_job.rb
├── models/
│   ├── concerns/
│   │   └── org_scoped.rb           # Multi-tenancy enforcement
│   ├── user.rb
│   ├── organization.rb
│   ├── api_key_config.rb
│   ├── saved_view.rb
│   └── alert.rb
├── services/
│   ├── concerns/
│   │   └── callable.rb
│   ├── result.rb
│   ├── telemetry/                  # ClickHouse query builders
│   │   ├── viewport_query.rb
│   │   ├── asset_history.rb
│   │   └── h3_aggregation.rb
│   ├── satellites/
│   │   ├── ground_track.rb
│   │   └── coverage_swath.rb
│   └── alerts/
│       └── evaluator.rb
└── views/
    └── layouts/
        └── application.html.erb    # Inertia root shell (minimal, no UI logic)
```

---

## Frontend Structure (React + TypeScript)

```
app/frontend/
├── components/
│   ├── globe/
│   │   ├── GlobeView.tsx               # resium <Viewer>, holds viewer ref
│   │   ├── CesiumSetup.ts              # Ion token, viewer config
│   │   ├── layers/                     # All imperative (NOT React components)
│   │   │   ├── AircraftLayer.ts        # BillboardCollection, clamped/at altitude
│   │   │   ├── VesselLayer.ts          # BillboardCollection, clamped to surface
│   │   │   ├── SatelliteLayer.ts       # Billboards at orbital alt + orbit paths + coverage
│   │   │   ├── BgpLayer.ts            # PointPrimitiveCollection on surface
│   │   │   └── NewsLayer.ts           # EntityCluster for built-in clustering
│   │   ├── controls/                   # React components (low-frequency UI)
│   │   │   ├── LayerToggle.tsx
│   │   │   ├── TimelineScrubber.tsx
│   │   │   └── ViewportInfo.tsx
│   │   └── primitives/
│   │       ├── coverageCone.ts         # Footprint geometry builder
│   │       └── orbitPath.ts            # Orbit polyline builder
│   ├── panels/
│   │   ├── AssetDetail.tsx
│   │   ├── OsintPanel.tsx
│   │   └── AlertConfig.tsx
│   └── ui/                             # Generic primitives (buttons, badges, etc.)
├── stores/
│   ├── globeStore.ts                   # 3D camera state + viewport H3 cells
│   ├── layerStore.ts
│   ├── timelineStore.ts
│   ├── selectionStore.ts
│   └── streamStore.ts
├── hooks/
│   ├── useAnyCable.ts                  # WebSocket connection management
│   ├── useViewport.ts                  # camera.computeViewRectangle() -> H3 cells
│   └── useTelemetry.ts                 # Subscribe to live feed by asset type
├── lib/
│   ├── h3.ts                           # H3 utility functions
│   ├── cesium.ts                       # CesiumJS setup and config
│   ├── coords.ts                       # Int32 ↔ Float coordinate conversion
│   ├── orbitMath.ts                    # Coverage geometry (elevation-masked), sensor half-angle classifier, inclined-circle orbit approximation
│   └── api.ts                          # Inertia router helpers
├── pages/                              # Inertia page components
│   ├── Dashboard.tsx                   # Main globe page
│   ├── Settings.tsx
│   └── Login.tsx
└── types/
    ├── telemetry.ts                    # FukanEvent, AssetType, etc.
    ├── globe.ts                        # Viewport, H3Cell, LayerConfig, CameraState
    └── api.ts                          # Inertia shared props types
```

---

## Zustand Store Architecture

### Design Principles

1. **One store per concern** — never a single monolithic store
2. **Surgical subscriptions** — components subscribe to only the slice they need
3. **Imperative globe updates** — telemetry updates CesiumJS primitives directly, NOT through React render
4. **No React re-renders for high-frequency data** — use `subscribe` outside components

### Store Definitions

```typescript
// stores/globeStore.ts
interface GlobeState {
  longitude: number         // radians (Cartographic)
  latitude: number          // radians (Cartographic)
  height: number            // meters (camera altitude)
  heading: number           // radians
  pitch: number             // radians
  roll: number              // radians
  viewportH3Cells: bigint[]
  setCamera: (v: Partial<GlobeState>) => void
  setH3Cells: (cells: bigint[]) => void
}

// stores/layerStore.ts
interface LayerState {
  layers: Record<AssetType, { visible: boolean; opacity: number }>
  toggleLayer: (type: AssetType) => void
  setOpacity: (type: AssetType, opacity: number) => void
}

// stores/timelineStore.ts
interface TimelineState {
  timestamp: number
  playing: boolean
  speed: number                   // 1 = realtime, 2 = 2x, etc.
  mode: 'live' | 'replay'
  setTimestamp: (ts: number) => void
  togglePlay: () => void
  setSpeed: (s: number) => void
  goLive: () => void
}

// stores/selectionStore.ts
interface SelectionState {
  selectedAssetId: string | null
  selectedAssetType: AssetType | null
  detailData: AssetDetail | null
  select: (id: string, type: AssetType) => void
  deselect: () => void
}

// stores/streamStore.ts
// WARNING: Updated at high frequency. NEVER bind React components directly.
interface StreamState {
  aircraft: Map<string, FukanEvent>
  vessels: Map<string, FukanEvent>
  satellites: Map<string, FukanEvent>
  bgp: Map<string, FukanEvent>
  upsert: (event: FukanEvent) => void
  upsertBatch: (events: FukanEvent[]) => void
}
```

### Critical Pattern: Imperative Map Updates

```typescript
// ✅ CORRECT — update CesiumJS outside React render cycle
useStreamStore.subscribe(
  (state) => state.aircraft,
  (aircraft) => {
    aircraftLayer.update(aircraft)
    viewer.scene.requestRender()
  }
)

// ❌ WRONG — causes React re-render on every telemetry update
function AircraftLayer() {
  const aircraft = useStreamStore((s) => s.aircraft)
  return <Entity position={...} billboard={...} />
}
```

---

## Shared Telemetry Types

These types are shared between frontend and the data contract with the Go ingest pipeline.

```typescript
// types/telemetry.ts
type AssetType = 'aircraft' | 'vessel' | 'satellite' | 'bgp_node'

interface FukanEvent {
  ts: number          // Unix epoch milliseconds
  id: string          // ICAO, MMSI, NORAD, ASN
  type: AssetType
  lat: number         // Int32 (latitude * 10_000_000) — decode before display
  lon: number         // Int32 (longitude * 10_000_000) — decode before display
  alt: number         // meters
  spd: number         // speed (knots or km/h depending on type)
  hdg: number         // heading in degrees
  h3: string          // H3 cell as hex string (BigInt in store)
  src: string         // provider identifier
  meta: string        // JSON blob, type-specific
}
```

---

## Rails Architecture Patterns

### Service Objects with Result Type

```ruby
# app/services/concerns/callable.rb
module Callable
  extend ActiveSupport::Concern
  class_methods do
    def call(...) = new(...).call
  end
end

# app/services/result.rb
class Result
  attr_reader :value, :error

  def initialize(success:, value: nil, error: nil)
    @success = success
    @value = value
    @error = error
  end

  def success? = @success
  def failure? = !@success

  def self.success(value = nil) = new(success: true, value:)
  def self.failure(error) = new(success: false, error:)
end
```

### Error Handling Doctrine

| Situation                        | Approach                            |
|----------------------------------|-------------------------------------|
| User input validation            | `Result.failure`, render 422        |
| Missing associations / bad state | `raise` (programmer error)          |
| External API failures            | `Result.failure` unless retry needed|
| Invariant violations             | `raise` with descriptive message    |
| Record not found                 | Let Rails raise (404)               |
| ClickHouse query timeout         | `Result.failure` with retry hint    |

**Rule of thumb:** Use `!` methods (fail fast) for operations that *must* succeed. Use Result for operations where failure is a normal business outcome.

### Multi-Tenancy Enforcement

```ruby
# app/models/concerns/org_scoped.rb
module OrgScoped
  extend ActiveSupport::Concern

  included do
    belongs_to :organization
    scope :for_org, ->(org) { where(organization: org) }
  end
end

# ✅ Always scope through current_user
class SettingsController < ApplicationController
  before_action :authenticate_user!

  def index
    api_keys = current_user.organization.api_key_configs
    render inertia: 'Settings', props: { apiKeys: ApiKeyConfigResource.new(api_keys).serializable_hash }
  end
end

# ❌ NEVER query without org scoping
ApiKeyConfig.find(params[:id])  # could return another org's data
```

### Inertia Controller Pattern

```ruby
# app/controllers/dashboard_controller.rb
class DashboardController < ApplicationController
  before_action :authenticate_user!

  def show
    render inertia: 'Dashboard', props: {
      user: UserResource.new(current_user).serializable_hash,
      organization: OrganizationResource.new(current_user.organization).serializable_hash,
      savedViews: SavedViewResource.new(current_user.saved_views).serializable_hash,
      layerDefaults: default_layer_config
      # Telemetry is NOT passed as props — loaded via AnyCable after mount
    }
  end
end
```

### ClickHouse Query Pattern — bootstrap shape

The `Telemetry::ViewportQuery` service is the entry point for initial page
load. It reads from `telemetry_latest_flat` (the argMax-merge view over
`telemetry_latest`) and returns rows in the **exact JSON shape of the
live broadcast** so `streamStore.upsert` can't tell the difference
between bootstrap events and live AnyCable events.

**Critical invariant:** the column aliases in `query_detail`'s SELECT
MUST track the `json:"..."` tags on Go's `model.FukanEvent` struct in
`fukan-ingest/internal/model/event.go`. Any drift means bootstrap and
live events disagree on field names — detail panels and client-side
computation (e.g. `computeOrbitPath()` reading `event.inclination`) will
silently read `undefined` and features will appear broken on initial
load but "fix themselves" after the first live update 30-120s later.
This has bitten us multiple times — grep for "schema drift" in memory.

```ruby
# app/services/telemetry/viewport_query.rb
module Telemetry
  class ViewportQuery
    include Callable

    MAX_CELLS = 2_000
    RESOLUTION_RANGE = (2..7)
    DETAIL_MIN_RESOLUTION = 3

    def initialize(h3_cells:, resolution:)
      @h3_cells = Array(h3_cells).first(MAX_CELLS)
      @resolution = resolution.clamp(RESOLUTION_RANGE)
    end

    def call
      return Result.success([]) if @h3_cells.empty?
      rows = @resolution >= DETAIL_MIN_RESOLUTION ? query_detail : query_aggregate
      Result.success(rows)
    rescue => e
      Result.failure(e.message)
    end

    private

    def query_detail
      # Column aliases MUST match Go model.FukanEvent JSON tags exactly.
      # toFloat64 / toInt64 casts are there because clickhouse-activerecord
      # returns Float32 / Int32 as Strings, which break `.toFixed` etc.
      # on the frontend.
      rows = Clickhouse.connection.exec_query(<<~SQL).to_a
        SELECT
          asset_id                             AS id,
          asset_type                           AS type,
          toUnixTimestamp64Milli(event_time)   AS ts,
          callsign,
          origin,
          category                             AS cat,
          toInt64(lat)                         AS lat,
          toInt64(lon)                         AS lon,
          toInt64(alt)                         AS alt,
          toFloat64(speed)                     AS spd,
          -- ...plus every other FukanEvent field, aliased to match the Go JSON tag
          toFloat64(inclination)               AS inclination,
          toFloat64(apogee_km)                 AS apogee_km,
          -- ...
        FROM fukan.telemetry_latest_flat
        WHERE h3ToParent(h3_cell, #{@resolution.to_i}) IN (#{cells_list})
      SQL
      rows.each { |r| r["h3"] = r.delete("h3_cell").to_i.to_s(16) }
      rows
    end
  end
end
```

A 3s Rails cache wrapper (`Telemetry::CachedViewportQuery`) sits in front
of this service so repeated subscribes from the same viewport don't
hammer ClickHouse. The cache key is `{resolution}:{sha256(sorted_cells)}`.

---

## AnyCable Channel Pattern

```ruby
# app/channels/telemetry_channel.rb
class TelemetryChannel < ApplicationCable::Channel
  def subscribed
    @h3_cells = params[:h3_cells] || []
    @asset_types = params[:asset_types] || %w[aircraft vessel satellite bgp_node]

    @h3_cells.each do |cell|
      stream_from "telemetry:#{cell}"
    end
  end

  def update_viewport(data)
    stop_all_streams
    @h3_cells = data["h3_cells"] || []
    @h3_cells.each do |cell|
      stream_from "telemetry:#{cell}"
    end
  end
end
```

**Client side:** Connect via `@rails/actioncable`, NOT Turbo Streams. AnyCable authenticates via Rails session cookie. Channel subscriptions managed by `useViewport` hook.

---

## CesiumJS Configuration

### Globe Setup

```typescript
// lib/cesium.ts — CesiumSetup
import { Ion, Viewer, Cartesian3, createWorldTerrainAsync } from 'cesium'

Ion.defaultAccessToken = cesiumIonToken // from Inertia shared props

const viewer = new Viewer('cesium-container', {
  scene3DOnly: true,
  requestRenderMode: true,
  maximumRenderTimeChange: Infinity,
  terrainProvider: await createWorldTerrainAsync(),
  // Disable all default UI widgets
  animation: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  navigationHelpButton: false,
})

// Initial camera position
viewer.camera.setView({
  destination: Cartesian3.fromDegrees(0, 20, 20_000_000),
})
```

### Camera-Height Data Strategy

| Camera height     | Viewport ~width | ClickHouse table    | Rendering                     |
|-------------------|-----------------|---------------------|-------------------------------|
| > 10,000 km       | > 2000 km       | `telemetry_h3_agg`  | Heatmap / density points      |
| 2,000-10,000 km   | 100-2000 km     | `telemetry_latest`  | Individual dots, clustered    |
| < 2,000 km        | < 100 km        | `telemetry_latest`  | Individual icons with labels  |

### Asset Layer Rendering (CesiumJS Primitive API)

| Asset      | Cesium API                  | Position                          | Notes                                                                        |
|------------|-----------------------------|-----------------------------------|------------------------------------------------------------------------------|
| Aircraft   | `BillboardCollection`       | `fromDegrees(lon, lat, alt)`      | White tint, rotated by heading, `NearFarScalar` scaling                      |
| Vessels    | `BillboardCollection`       | `fromDegrees(lon, lat, 0)` clamped| White tint, ship icon rotated by heading                                     |
| Satellites | `BillboardCollection` + `PolylineCollection` + `GroundPrimitive` | `fromDegrees(lon, lat, orbitalAlt)` | **Cyan tint** (`SAT_COLOR`) to distinguish from aircraft/vessels. True orbital altitude. |
| BGP        | `PointPrimitiveCollection`  | Clamped to ground                 | Color by event type, arcs via `PolylineCollection`                           |
| News       | `CustomDataSource` + `EntityCluster` | Clamped to ground          | Built-in clustering, lower frequency                                         |

All layers subscribe to `streamStore` slices via `zustand.subscribe()` outside React — no re-renders.

### Satellite 3D Features

**Orbit paths:** `PolylineCollection` drawing an **inclined great-circle
approximation** of the orbital plane through the satellite's current
sub-satellite point. Computed client-side in `~/lib/orbitMath.ts`
(`computeOrbitPath(event)`) from only two inputs:
- The live `event.inclination` field (populated by the Go TLE worker on
  every SGP4 propagation and carried on every broadcast)
- The current ECEF position from the same event

The function builds an orthonormal basis `(U = P̂, V = N × U)` where the
plane normal `N` satisfies `N · P = 0` and `N · Z = cos(i)`, then samples
181 closed-loop points at constant radius `|P|`. Auto-refreshes in
`SatelliteLayer.update()` whenever the selected satellite's position
changes, so the orbit stays anchored to the live billboard.

**Explicit limitations** (surface these honestly if users ask):
- **Not a ground track** — a static ECEF snapshot of the orbital plane,
  Earth rotation is ignored.
- **Not SGP4-accurate** — no J2 precession, no atmospheric drag, no
  eccentricity. Molniya / GTO orbits diverge from the drawn circle.
- **Arbitrary ascending/descending choice** — without a velocity vector
  there are two valid planes through `P` at inclination `i`; the code
  consistently picks the positive-cosine branch, so half of satellites
  have a mirrored-tilt orbit that still passes through `P` correctly.

**Upgrade path** — full Keplerian elements in a new TLE-sourced
`satellite_orbit` ClickHouse table (eccentricity, RAAN, arg of perigee,
mean anomaly). Documented in `fukan-ingest/docs/PLAN.md` as Path B; not
implemented.

**Coverage footprints:** `GroundPrimitive` with `EllipseGeometry` draped
on terrain, cyan-tinted with low alpha. Radius is the minimum of two
geometric constraints:

```
Sensor-limited:    θ_sensor    = asin((R + h) × sin(α) / R) − α
Elevation-masked:  θ_elevation = acos(R × cos(ε) / (R + h)) − ε

radius_km = R × min(θ_sensor, θ_elevation)
```

where `R = 6371 km`, `h = current altitude`, `α = sensor half-angle
estimate`, and `ε = 10°` (the `COVERAGE_ELEVATION_MASK_DEG` constant).
The elevation mask excludes users below ~10° to account for atmospheric
signal degradation — which cuts LEO comms footprints roughly in half
vs the horizon-grazing formula alone.

**Sensor half-angle classification** (`getHalfAngle()` in `orbitMath.ts`)
returns `{halfAngleDeg, label, confidence}` by matching satellite name
patterns against seven classes, because GCAT doesn't provide sensor
specs and most operator datasheets don't either:

| Match rule | α | Confidence | Example class |
|---|---|---|---|
| Altitude > 30,000 km | 8.7° | high | Comms GEO (Earth disc) |
| Name matches GPS/NAVSTAR/GALILEO/GLONASS/BEIDOU/QZSS | 13.8° | high | Navigation MEO |
| Name matches NOAA/GOES/METOP/HIMAWARI/FENGYUN/DMSP/METEOSAT | 55° | medium | Weather LEO |
| Name matches LANDSAT/SENTINEL/WORLDVIEW/PLEIADES/ICEYE/TERRASAR/COSMO-SKYMED/RADARSAT | 3° | medium | Imaging LEO |
| Name matches STARLINK/ONEWEB/IRIDIUM/GLOBALSTAR/KUIPER/ORBCOMM/SWARM | 55° | medium | Comms LEO |
| Name matches ISS/ZARYA/TIANHE/MIR | 90° (horizon) | low | Crewed station |
| default | 45° | low | LEO (estimated) |

**UI rule:** The detail panel surfaces coverage with an explicit ESTIMATE
badge and a footnote explaining the 10° elevation mask and that real
payloads may use spot beams or steered sensors that a single-cone
visualization can't capture. See `SatelliteDetailPanel.tsx`.

**Coverage cones (optional):** A `buildConeSpokes()` helper exists at
`components/globe/primitives/coverageCone.ts` for the visual cone effect
(8–16 polylines from satellite position to footprint edge), but it's
not currently wired into `SatelliteLayer`. Reserved for future use.

**Display logic:** Orbit + coverage are only drawn for the *selected*
satellite — drawing them for all satellites is visually noisy and
expensive.

### Viewport Filtering for 3D Camera

```typescript
// Use camera.computeViewRectangle() for visible area
const rect = viewer.camera.computeViewRectangle()
// Convert rectangle to H3 cells via h3.polygonToCells()
// Camera height -> effective H3 resolution:
//   >10,000km = res 2-3, 2k-10k = res 4-5, 500-2k = res 5-6, <500 = res 7
// Debounce at 300ms, fire on camera.changed event
```

### Performance

- Use Primitive API (not Entity) for all high-frequency layers
- `requestRenderMode: true` + explicit `scene.requestRender()` after updates
- `NearFarScalar` for billboard scale/translucency by distance
- Coverage cones only for selected satellites
- Orbit path LOD: fewer vertices at far zoom
- Texture atlas for all icon variants
- Stale entity cleanup on timeout

---

## Testing Strategy

### Rails (RSpec)

```ruby
# Model specs: associations, validations, scopes, org-scoping
# Service specs: business logic with mocked externals
# Request specs: full controller flow including auth + Inertia response
# Channel specs: AnyCable subscription and viewport updates

# ClickHouse queries: use a test ClickHouse instance
# Do NOT mock ClickHouse — query behavior is too important to fake
```

### React (Vitest + Testing Library)

```typescript
// Component tests: render with mock props, verify UI state
// Store tests: verify Zustand state transitions
// Hook tests: mock AnyCable, verify subscription behavior
// NEVER test CesiumJS rendering in unit tests — use Playwright for that
```

### E2E (Playwright)

```
// Critical flows:
// 1. Login → globe renders → layers visible
// 2. Pan/zoom → viewport updates → new data loads
// 3. Click asset → detail panel opens with correct data
// 4. Save view → reload → view restored
```

---

## Environment Variables

```bash
# Rails
RAILS_ENV=production
SECRET_KEY_BASE=xxx
DATABASE_URL=postgres://fukan:xxx@pg:5432/fukan_production
REDIS_URL=redis://redis:6379/0

# ClickHouse (read-only from Rails)
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_DATABASE=fukan

# AnyCable
ANYCABLE_RPC_HOST=0.0.0.0:50051
ANYCABLE_REDIS_URL=redis://redis:6379/1

# CesiumJS
CESIUM_ION_ACCESS_TOKEN=xxx

# Auth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Billing (future)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

---

## Don't Do These Things

### Product Decisions

1. **No satellite imagery** — orbit tracks and coverage swaths only
2. **No PII from social feeds** — aggregated token density per H3 cell only
3. **No data redistribution** — BYOD model, users bring their own API keys
4. **No mobile app in v1** — web with CesiumJS globe only
5. **No user-uploaded layers in v1** — system feeds only
6. **No complex permissions** — all org users see all data
7. **No per-user dashboards** — one shared globe view

### Technical Decisions

9. **No Turbo Streams / Hotwire** — Inertia + React owns the frontend
10. **No ERB for UI** — React components only; ERB is just the Inertia shell
11. **No Jbuilder / Jb** — Alba with OJ for all serialization; use `alba_inertia` for Inertia props, Alba resources for JSON API endpoints
12. **No Rails credentials** — environment variables only
13. **No writing to ClickHouse from Rails** — Go ingest pipeline owns all writes
14. **No localStorage in React** — Zustand for all client state
15. **No React re-renders for live telemetry** — imperative CesiumJS Primitive API updates
16. **No Mapbox GL JS / MapLibre GL JS** — CesiumJS + resium with Cesium Ion
17. **No business logic in controllers** — service objects only
18. **No routes nested > 2 levels** — shallow nesting
19. **No skipping tests** — every feature needs specs/tests
20. **No `any` types in TypeScript** — strict typing everywhere

---

## Verification Checklist

Before marking any task complete:

- [ ] All referenced models/modules/classes exist
- [ ] All redirect paths are defined in routes.rb
- [ ] Migrations created and run for PostgreSQL changes (if needed)
- [ ] Multi-tenancy: all queries scoped through current_user.organization
- [ ] No telemetry writes to ClickHouse from Rails
- [ ] Service objects return Result, not raw values
- [ ] TypeScript: no `any` types, all props typed
- [ ] Zustand: high-frequency data updates CesiumJS primitives imperatively
- [ ] Tests written and passing (Rails + React as applicable)
- [ ] Environment variables documented if new ones added

---

## Quick Reference

```bash
# Rails
bundle exec rspec                          # All specs
bundle exec rspec spec/models/             # Model specs
bundle exec rspec spec/services/           # Service specs
bundle exec rspec spec/requests/           # Request specs
rails db:migrate                           # PostgreSQL only (ClickHouse has database_tasks: false)

# React
npx vitest                                 # All tests
npx vitest --run stores/                   # Store tests
npx playwright test                        # E2E tests

# Dev
bin/dev                                    # Start Rails + Vite + Sidekiq
```

---

## Questions?

1. Check `db/schema.rb` for PostgreSQL structure
2. Check ClickHouse `system.tables` for telemetry schema
3. Check existing patterns in similar files
4. Check `spec/` and `__tests__/` for expected behavior
5. When in doubt, keep it simple
6. Ask the developer before generating complex code

**Remember: Fukan democratizes intelligence. The code should be equally accessible — clear, well-tested, and simple enough that any contributor can understand it.**

class TelemetryChannel < ApplicationCable::Channel
  # Streams are registered down to res 3 so continental-zoom viewers (1.5 Mm
  # altitude band) still receive live updates. The Go publisher broadcasts at
  # res 2–7, so the subscription matches whatever resolution the client sends.
  MIN_STREAM_RESOLUTION = 3
  MAX_STREAM_CELLS = 2_000

  # Asset types routed through this channel. `bgp_node` has its own channel
  # (BgpEventsChannel) and `news` is not yet implemented. When the client
  # doesn't specify asset_types we default to all three moving-asset kinds.
  ALL_ASSET_TYPES = %w[aircraft vessel satellite].freeze

  state_attr_accessor :h3_cells, :resolution, :asset_types

  def subscribed
    self.h3_cells = Array(params[:h3_cells]).map(&:to_s)
    self.resolution = (params[:resolution] || 7).to_i.clamp(2, 7)
    self.asset_types = filter_asset_types(params[:asset_types])

    # Subscribe to live streams FIRST so deltas flow immediately, then run
    # the bootstrap inline. The bootstrap MUST run on the RPC thread: AnyCable
    # ships transmissions by reading Socket#transmissions after `subscribed`
    # returns (see anycable-core Socket#transmit — it just appends to an array
    # that the RPC handler reads once). A background thread's `transmit` would
    # append to a discarded array and silently never reach the client.
    # streamStore.upsert is last-write-wins by asset_id, so live events
    # arriving during bootstrap are authoritative when newer and harmlessly
    # overwritten when older.
    subscribe_to_streams if resolution >= MIN_STREAM_RESOLUTION
    bootstrap
  end

  def unsubscribed
    stop_all_streams
  end

  private

  def bootstrap
    started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    result = Telemetry::CachedViewportQuery.call(
      h3_cells: h3_cells,
      resolution: resolution,
      asset_types: asset_types
    )

    return unless result.success?

    # transmit(cable_message) takes a positional hash; Ruby 3+ rejects
    # bare kwargs here with "wrong number of arguments (given 0, expected 1)".
    transmit({
      type: "bootstrap",
      resolution: resolution,
      data: result.value,
      meta: bootstrap_meta(result.value)
    })
    elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round(1)
    Rails.logger.info(
      "[perf] telemetry.bootstrap elapsed=#{elapsed_ms}ms rows=#{result.value.size} " \
      "cells=#{h3_cells.size} resolution=#{resolution} types=#{asset_types.join(',')}"
    )
  end

  # H3 cells are opaque hex strings (h3-js canonical form, matching
  # h3-go Cell.String() on the publisher side). fukan-ingest publishes each
  # event to `telemetry:<asset_type>:<h3_hex>` across H3 res 2–7 so subscribers
  # at any zoom receive updates matching their enabled layers, without server-
  # side child expansion or cross-layer fan-out.
  def subscribe_to_streams
    cells = h3_cells.first(MAX_STREAM_CELLS)
    asset_types.each do |type|
      cells.each { |cell| stream_from "telemetry:#{type}:#{cell}" }
    end
  end

  def bootstrap_meta(rows)
    limit = Telemetry::ViewportQuery.detail_limit_for(resolution)
    {
      stream: "telemetry",
      row_count: rows.size,
      limit: limit,
      sampled: rows.size >= limit,
      generated_at: (Time.current.to_f * 1000).round,
      cell_count: h3_cells.size,
      resolution: resolution,
      asset_types: asset_types
    }
  end

  # Drop unknown types (e.g. a future `news` that hasn't been wired end-to-end)
  # so a malicious or out-of-date client can't force an arbitrary stream name.
  def filter_asset_types(param)
    requested = Array(param).map(&:to_s)
    filtered = requested & ALL_ASSET_TYPES
    filtered.empty? ? ALL_ASSET_TYPES.dup : filtered
  end
end

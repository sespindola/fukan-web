class BgpEventsChannel < ApplicationCable::Channel
  # BGP events are broadcast by fukan-ingest at a single H3 resolution (3)
  # via the Redis `__anycable__` pub/sub channel with stream key
  # "bgp:<res3_hex>". The frontend sends res-3 parent cells of its current
  # viewport regardless of zoom band — BGP event coordinates are imprecise
  # enough that zoom-band-precise subscriptions would be misleading.
  MAX_STREAM_CELLS = 2_000

  state_attr_accessor :h3_cells

  def subscribed
    self.h3_cells = Array(params[:h3_cells]).map(&:to_s)

    # Subscribe to live streams first, then bootstrap inline on the RPC thread.
    # AnyCable collects transmissions from Socket#transmissions after
    # `subscribed` returns; background-thread transmit can be discarded.
    subscribe_to_streams
    bootstrap
  end

  def unsubscribed
    stop_all_streams
  end

  private

  def bootstrap
    started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    result = Bgp::CachedViewportQuery.call(h3_cells: h3_cells)
    return unless result.success?

    transmit({ type: "bootstrap", data: result.value, meta: bootstrap_meta(result.value) })
    elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round(1)
    Rails.logger.info(
      "[perf] bgp.bootstrap elapsed=#{elapsed_ms}ms rows=#{result.value.size} cells=#{h3_cells.size}"
    )
  end

  # H3 cells are opaque res-3 hex strings. Match the Go publisher side
  # (internal/redis/publisher.go PublishBGPBatch, which uses
  # h3-go Cell.Parent(3).String()) and h3-js cellToParent(cell, 3) output
  # on the frontend.
  def subscribe_to_streams
    h3_cells.first(MAX_STREAM_CELLS).each do |cell|
      stream_from "bgp:#{cell}"
    end
  end

  def bootstrap_meta(rows)
    {
      stream: "bgp",
      row_count: rows.size,
      limit: Bgp::ViewportQuery::MAX_ROWS,
      sampled: rows.size >= Bgp::ViewportQuery::MAX_ROWS,
      generated_at: (Time.current.to_f * 1000).round,
      cell_count: h3_cells.size,
      resolution: Bgp::ViewportQuery::BROADCAST_RESOLUTION,
      asset_types: [ "bgp_node" ]
    }
  end
end

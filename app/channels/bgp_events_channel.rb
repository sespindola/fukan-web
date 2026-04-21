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

    bootstrap
    subscribe_to_streams
  end

  def unsubscribed
    stop_all_streams
  end

  private

  def bootstrap
    result = Bgp::CachedViewportQuery.call(h3_cells: h3_cells)
    return unless result.success?

    transmit({ type: "bootstrap", data: result.value })
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
end

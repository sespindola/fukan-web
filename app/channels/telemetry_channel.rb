class TelemetryChannel < ApplicationCable::Channel
  # The browser compacts a close-range viewport into non-overlapping mixed-
  # resolution cells. Coarse viewports use the aggregate HTTP snapshot and do
  # not open individual telemetry streams.
  MAX_STREAM_CELLS = 2_000

  # Asset types routed through this channel. `bgp_node` has its own channel
  # (BgpEventsChannel) and `news` is not yet implemented. When the client
  # doesn't specify asset_types we default to all three moving-asset kinds.
  ALL_ASSET_TYPES = %w[aircraft vessel satellite].freeze

  state_attr_accessor :stream_cells, :asset_types

  def subscribed
    # h3_cells is retained as a rolling-deploy fallback for older clients.
    self.stream_cells = Array(params[:stream_cells] || params[:h3_cells]).map(&:to_s)
    self.asset_types = filter_asset_types(params[:asset_types])

    subscribe_to_streams
  end

  def unsubscribed
    stop_all_streams
  end

  private

  # H3 cells are opaque hex strings (h3-js canonical form, matching
  # h3-go Cell.String() on the publisher side). fukan-ingest publishes each
  # event to `telemetry:<asset_type>:<h3_hex>` across H3 res 2–7 so subscribers
  # at any zoom receive updates matching their enabled layers, without server-
  # side child expansion or cross-layer fan-out.
  def subscribe_to_streams
    cells = stream_cells.first(MAX_STREAM_CELLS).select { |cell| valid_h3_cell?(cell) }
    asset_types.each do |type|
      cells.each { |cell| stream_from "telemetry:#{type}:#{cell}" }
    end
  end

  def valid_h3_cell?(cell)
    cell.match?(/\A[0-9a-f]{15}\z/i) && cell[1].to_i.between?(2, 7)
  end

  # Drop unknown types (e.g. a future `news` that hasn't been wired end-to-end)
  # so a malicious or out-of-date client can't force an arbitrary stream name.
  def filter_asset_types(param)
    requested = Array(param).map(&:to_s)
    filtered = requested & ALL_ASSET_TYPES
    filtered.empty? ? ALL_ASSET_TYPES.dup : filtered
  end
end

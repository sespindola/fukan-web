class TelemetryChannel < ApplicationCable::Channel
  # Streams are registered down to res 3 so continental-zoom viewers (1.5 Mm
  # altitude band) still receive live updates. The Go publisher broadcasts at
  # res 2–7, so the subscription matches whatever resolution the client sends.
  MIN_STREAM_RESOLUTION = 3
  MAX_STREAM_CELLS = 2_000

  state_attr_accessor :h3_cells, :resolution

  def subscribed
    self.h3_cells = Array(params[:h3_cells]).map(&:to_s)
    self.resolution = (params[:resolution] || 7).to_i.clamp(2, 7)

    bootstrap

    subscribe_to_streams if resolution >= MIN_STREAM_RESOLUTION
  end

  def unsubscribed
    stop_all_streams
  end

  private

  def bootstrap
    result = Telemetry::CachedViewportQuery.call(
      h3_cells: h3_cells,
      resolution: resolution
    )

    return unless result.success?

    # transmit(cable_message) takes a positional hash; Ruby 3+ rejects
    # bare kwargs here with "wrong number of arguments (given 0, expected 1)".
    transmit({ type: "bootstrap", resolution: resolution, data: result.value })
  end

  # H3 cells are opaque hex strings (h3-js canonical form, matching
  # h3-go Cell.String() on the publisher side). fukan-ingest broadcasts every
  # event to its res 5, 6, and 7 parent stream keys so subscribers at any zoom
  # in that range receive updates without any server-side child expansion.
  def subscribe_to_streams
    h3_cells.first(MAX_STREAM_CELLS).each do |cell|
      stream_from "telemetry:#{cell}"
    end
  end
end

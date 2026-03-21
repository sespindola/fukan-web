class TelemetryChannel < ApplicationCable::Channel
  STREAM_RESOLUTION = 7
  MAX_STREAM_CELLS = 2_000

  state_attr_accessor :h3_cells, :resolution

  def subscribed
    self.h3_cells = Array(params[:h3_cells]).map(&:to_s)
    self.resolution = (params[:resolution] || 7).to_i.clamp(2, 7)

    bootstrap

    subscribe_to_streams if resolution >= 5
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

    transmit(type: "bootstrap", resolution: resolution, data: result.value)
  end

  def subscribe_to_streams
    cells = expand_to_stream_resolution(h3_cells, resolution)

    cells.first(MAX_STREAM_CELLS).each do |cell|
      stream_from "telemetry:#{cell}"
    end
  end

  # Expand cells from current resolution to res-7 for streaming.
  # At res 7: 1:1. At res 6: ~7 children each. At res 5: ~49 children each.
  def expand_to_stream_resolution(cells, resolution)
    return cells if resolution >= STREAM_RESOLUTION

    cells.flat_map do |cell|
      cell_int = cell.to_i
      expand_h3_children(cell_int, resolution, STREAM_RESOLUTION)
    end.map(&:to_s)
  end

  # Recursively expand H3 cell to target resolution children.
  # Each H3 cell has 7 children (center + 6 hexagonal neighbors).
  def expand_h3_children(cell, current_res, target_res)
    return [ cell ] if current_res >= target_res

    (0...7).flat_map do |child_idx|
      child = (cell << 3) | child_idx
      expand_h3_children(child, current_res + 1, target_res)
    end
  end
end

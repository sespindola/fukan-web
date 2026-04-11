class FetchAircraftImageJob < ApplicationJob
  queue_as :image_fetch

  def perform(icao24)
    detail = Aircraft::DetailQuery.call(icao24:)
    if detail.success? && detail.value["image_url"].present?
      broadcast(icao24, detail.value["image_url"], detail.value["image_attribution"])
      return
    end

    result = Aircraft::FetchImage.call(icao24:)
    return unless result.success? && result.value

    broadcast(icao24, result.value[:image_url], result.value[:image_attribution])
  end

  private

  def broadcast(icao24, image_url, image_attribution)
    ActionCable.server.broadcast(
      "aircraft_detail:#{icao24.upcase}",
      {
        type: "image_update",
        icao24: icao24.upcase,
        image_url: image_url,
        image_attribution: image_attribution
      }
    )
  end
end

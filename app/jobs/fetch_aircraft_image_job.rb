class FetchAircraftImageJob < ApplicationJob
  queue_as :default

  def perform(icao24)
    result = Aircraft::FetchImage.call(icao24:)

    return unless result.success? && result.value

    ActionCable.server.broadcast(
      "aircraft_detail:#{icao24.upcase}",
      {
        type: "image_update",
        icao24: icao24.upcase,
        image_url: result.value[:image_url],
        image_attribution: result.value[:image_attribution]
      }
    )
  end
end

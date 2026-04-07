class AircraftDetailChannel < ApplicationCable::Channel
  def subscribed
    icao24 = params[:icao24]&.upcase
    reject unless icao24.present?

    stream_from "aircraft_detail:#{icao24}"
  end
end

module Api
  class AircraftController < ApplicationController
    def show
      result = Aircraft::DetailQuery.call(icao24: params[:id])

      if result.failure?
        render json: { error: result.error }, status: :not_found
        return
      end

      detail = result.value

      if detail["image_url"].blank? &&
         Aircraft::FetchImage.available? &&
         !negative_image_cache?(params[:id])
        FetchAircraftImageJob.perform_later(params[:id])
      end

      render json: detail
    end

    private

    def negative_image_cache?(icao24)
      Rails.cache.exist?("aircraft_img_404:#{icao24.to_s.upcase}")
    end
  end
end

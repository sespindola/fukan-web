module Api
  class AircraftController < ApplicationController
    def show
      result = Aircraft::DetailQuery.call(icao24: params[:id])

      if result.failure?
        render json: { error: result.error }, status: :not_found
        return
      end

      detail = result.value

      # Enqueue image fetch if not yet cached
      if detail["image_url"].blank?
        FetchAircraftImageJob.perform_later(params[:id])
      end

      render json: detail
    end
  end
end

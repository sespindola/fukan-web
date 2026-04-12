module Api
  class SatellitesController < ApplicationController
    def show
      result = Satellite::DetailQuery.call(norad_id: params[:id])

      if result.failure?
        render json: { error: result.error }, status: :not_found
        return
      end

      render json: result.value
    end
  end
end

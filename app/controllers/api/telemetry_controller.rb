module Api
  class TelemetryController < ApplicationController
    def create
      result = Telemetry::ViewportSnapshot.call(
        h3_cells: params[:cells],
        resolution: params[:resolution],
        asset_types: params[:asset_types],
        mode: params[:mode]
      )

      if result.failure?
        render json: { error: result.error }, status: :unprocessable_entity
        return
      end

      render json: result.value
    end
  end
end

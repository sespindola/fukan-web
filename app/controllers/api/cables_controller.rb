module Api
  class CablesController < ApplicationController
    def index
      result = Cable::ViewportQuery.call(
        west: params[:west],
        south: params[:south],
        east: params[:east],
        north: params[:north],
        limit: params[:limit]
      )

      if result.failure?
        render json: { error: result.error }, status: :unprocessable_entity
        return
      end

      render json: result.value
    end
  end
end

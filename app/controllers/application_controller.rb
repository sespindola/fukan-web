class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  inertia_share do
    {
      cesiumIonToken: ENV.fetch("CESIUM_ION_ACCESS_TOKEN", ""),
      flash: {
        notice: flash[:notice],
        alert: flash[:alert]
      }
    }
  end
end

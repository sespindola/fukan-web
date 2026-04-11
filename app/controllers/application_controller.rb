class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  before_action :authenticate_user!

  inertia_share do
    {
      flash: {
        notice: flash[:notice],
        alert: flash[:alert]
      },
      current_user: current_user&.as_json(only: [:id, :email, :role])
    }
  end
end

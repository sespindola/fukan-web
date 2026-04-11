# frozen_string_literal: true

class SettingsController < ApplicationController
  layout "settings"

  def show
  end

  def update
    if current_user.update(user_params)
      redirect_to settings_path, notice: "Settings updated."
    else
      render :show, status: :unprocessable_content
    end
  end

  private

  def user_params
    params.require(:user).permit(:email)
  end
end

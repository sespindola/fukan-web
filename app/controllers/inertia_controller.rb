# frozen_string_literal: true

class InertiaController < ApplicationController
  include Alba::Inertia::Controller

  # Share data with all Inertia responses
  # see https://inertia-rails.dev/guide/shared-data
  #   inertia_share user: -> { UserResource.new(Current.user).to_inertia }

  private

  def inertia_serializer_params
    { current_user: current_user }
  end
end

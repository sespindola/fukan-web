# frozen_string_literal: true

class DashboardController < ApplicationController
  def show
    render inertia: "Dashboard", props: {}
  end
end

# frozen_string_literal: true

class DashboardController < InertiaController
  def show
    render inertia: "Dashboard", props: {}
  end
end

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end

    private

    def find_verified_user
      # TODO: Re-enable when Devise auth is wired up
      # session = Session.find_by(id: cookies.signed[:session_token])
      # if session&.user
      #   session.user
      # else
      #   reject_unauthorized_connection
      # end
      "anonymous"
    end
  end
end

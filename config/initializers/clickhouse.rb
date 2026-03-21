module Clickhouse
  class Base < ActiveRecord::Base
    self.abstract_class = true

    connects_to database: { writing: :clickhouse, reading: :clickhouse }
  end

  def self.connection
    Base.connection
  end
end

class Result
  attr_reader :value, :error

  def initialize(success:, value: nil, error: nil)
    @success = success
    @value = value
    @error = error
  end

  def success? = @success
  def failure? = !@success

  def self.success(value = nil) = new(success: true, value:)
  def self.failure(error) = new(success: false, error:)
end

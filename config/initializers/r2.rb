require "aws-sdk-s3"

if ENV["R2_ACCESS_KEY_ID"].present?
  r2_client = Aws::S3::Resource.new(
    access_key_id: ENV.fetch("R2_ACCESS_KEY_ID"),
    secret_access_key: ENV.fetch("R2_SECRET_ACCESS_KEY"),
    endpoint: ENV.fetch("R2_ENDPOINT"),
    region: "auto"
  )

  Rails.configuration.x.r2_bucket = r2_client.bucket(ENV.fetch("R2_BUCKET"))
  Rails.configuration.x.r2_public_url = ENV.fetch("R2_PUBLIC_URL")
else
  Rails.configuration.x.r2_bucket = nil
  Rails.configuration.x.r2_public_url = nil
end

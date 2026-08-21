# README

This README would normally document whatever steps are necessary to get the
application up and running.

Things you may want to cover:

* Ruby version

* System dependencies

* Configuration

* Database creation

* Database initialization

* How to run the test suite

* Services (job queues, cache servers, search engines, etc.)

* Deployment instructions

## Telemetry performance controls

Moving telemetry uses 200 ms live delta batches and coarse viewport density
LOD by default. Set `VITE_TELEMETRY_LOD=false` at build time to restore
individual assets at resolutions 2–4 during rollback. Browser performance
logs are disabled by default; enable them with `VITE_PERF_LOGS=true`.

In development, AnyCable metrics are exposed at
`http://localhost:8091/metrics` by `Procfile.dev`.

* ...

require "rails_helper"

RSpec.describe Telemetry::ViewportSnapshot do
  it "returns an empty aggregate snapshot for a coarse empty viewport" do
    result = described_class.call(h3_cells: [], resolution: 3, asset_types: [ "aircraft" ])

    expect(result).to be_success
    expect(result.value).to include(mode: "aggregate", resolution: 3, cells: [])
  end

  it "returns an empty detail snapshot for a close empty viewport" do
    result = described_class.call(h3_cells: [], resolution: 6, asset_types: [ "satellite" ])

    expect(result).to be_success
    expect(result.value).to include(mode: "detail", resolution: 6, events: [])
  end

  it "allows detail mode to override coarse LOD for rollback" do
    result = described_class.call(h3_cells: [], resolution: 3, asset_types: [ "aircraft" ], mode: "detail")

    expect(result).to be_success
    expect(result.value).to include(mode: "detail", resolution: 3, events: [])
  end
end

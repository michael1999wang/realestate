-- Database initialization script for rent estimator service

-- Create rent_estimates table
CREATE TABLE rent_estimates (
  listing_id TEXT PRIMARY KEY,
  listing_version INT NOT NULL,
  estimator_version TEXT NOT NULL,
  method TEXT NOT NULL,
  p25 NUMERIC,
  p50 NUMERIC NOT NULL,
  p75 NUMERIC,
  stdev NUMERIC,
  features_used JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_row_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX ON rent_estimates ((features_used->>'city'));
CREATE INDEX ON rent_estimates ((features_used->>'fsa'));
CREATE INDEX ON rent_estimates (method);
CREATE INDEX ON rent_estimates (computed_at);
CREATE INDEX ON rent_estimates (estimator_version);

-- Create trigger to update updated_row_at on changes
CREATE OR REPLACE FUNCTION update_updated_row_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_row_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rent_estimates_updated_row_at
  BEFORE UPDATE ON rent_estimates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_row_at();

-- Create sample data for testing (optional)
INSERT INTO rent_estimates (
  listing_id, 
  listing_version, 
  estimator_version, 
  method, 
  p25, 
  p50, 
  p75, 
  stdev, 
  features_used,
  computed_at
) VALUES (
  'sample-listing-1',
  1,
  '1.0.0',
  'comps',
  2800,
  3200,
  3600,
  200,
  '{
    "beds": 2,
    "baths": 2,
    "sqft": 900,
    "propertyType": "Condo",
    "city": "Toronto",
    "fsa": "M5V",
    "comps": [
      {"id": "comp-1", "rent": 3100, "beds": 2, "baths": 2, "sqft": 850, "distanceKm": 0.5, "daysOld": 15}
    ]
  }'::jsonb,
  '2024-01-15T10:00:00Z'
);

-- Grant permissions
GRANT ALL PRIVILEGES ON rent_estimates TO rent;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rent;

-- Enrichment Service Database Schema

CREATE TABLE enrichments (
  listing_id TEXT PRIMARY KEY,
  listing_version INT NOT NULL,
  enrichment_version TEXT NOT NULL,
  geo JSONB,
  taxes JSONB,
  fees JSONB,
  rent_priors JSONB,
  location_scores JSONB,
  cost_rules JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_row_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX ON enrichments ((rent_priors->>'p50'));
CREATE INDEX ON enrichments ((cost_rules->>'lttRule'));
CREATE INDEX ON enrichments (enrichment_version);
CREATE INDEX ON enrichments (computed_at);

-- GIN index for full JSONB searches if needed
CREATE INDEX enrichments_geo_gin ON enrichments USING GIN (geo);
CREATE INDEX enrichments_rent_priors_gin ON enrichments USING GIN (rent_priors);

-- Update trigger for updated_row_at
CREATE OR REPLACE FUNCTION update_updated_row_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_row_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_enrichments_updated_row_at 
    BEFORE UPDATE ON enrichments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_row_at_column();

-- Sample data for testing (optional)
-- INSERT INTO enrichments (listing_id, listing_version, enrichment_version, geo, taxes, fees, rent_priors, location_scores, cost_rules) 
-- VALUES (
--   'sample-listing-1',
--   1,
--   '1.0.0',
--   '{"lat": 43.6532, "lng": -79.3832, "fsa": "M5V", "source": "listing"}',
--   '{"annualEstimate": 5000, "method": "exact"}',
--   '{"condoFeeMonthly": 400}',
--   '{"p25": 1800, "p50": 2200, "p75": 2800, "source": "cmhc", "metro": "Toronto", "fsa": "M5V"}',
--   '{"walk": 85, "transit": 90, "bike": 75, "provider": "walkscore"}',
--   '{"lttRule": "toronto_double", "insuranceMonthlyEstimate": 60}'
-- );

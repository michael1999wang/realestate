-- Underwriting Service Database Schema
-- PostgreSQL 16+

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Mortgage factors (precomputed annuity factors for performance)
CREATE TABLE IF NOT EXISTS mortgage_factors (
  rate_bps INT NOT NULL,
  amort_months INT NOT NULL,
  af NUMERIC(12,10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_bps, amort_months)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_mortgage_factors_lookup ON mortgage_factors (rate_bps, amort_months);

-- Base inputs cache (optional - can be computed on-the-fly from joins)
-- This table serves as a materialized view of the complex joins
CREATE TABLE IF NOT EXISTS listing_base (
  listing_id TEXT PRIMARY KEY,
  listing_version INT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  closing_costs NUMERIC(12,2) NOT NULL,
  noi_p25 NUMERIC(12,2) NOT NULL,
  noi_p50 NUMERIC(12,2) NOT NULL,
  noi_p75 NUMERIC(12,2) NOT NULL,
  city TEXT NOT NULL,
  province TEXT NOT NULL,
  property_type TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for version-based queries
CREATE INDEX IF NOT EXISTS idx_listing_base_version ON listing_base (listing_id, listing_version);

-- Shared grid (cross-user reusable computations)
CREATE TABLE IF NOT EXISTS underwrite_grid (
  listing_id TEXT NOT NULL,
  listing_version INT NOT NULL,
  rent_scenario TEXT NOT NULL CHECK (rent_scenario IN ('P25', 'P50', 'P75')),
  down_pct_bin NUMERIC(6,4) NOT NULL,
  rate_bps_bin INT NOT NULL,
  amort_months INT NOT NULL CHECK (amort_months IN (240, 300, 360)),
  metrics_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, listing_version, rent_scenario, down_pct_bin, rate_bps_bin, amort_months)
);

-- Indexes for grid queries
CREATE INDEX IF NOT EXISTS idx_underwrite_grid_listing ON underwrite_grid (listing_id, listing_version);
CREATE INDEX IF NOT EXISTS idx_underwrite_grid_scenario ON underwrite_grid (rent_scenario);
CREATE INDEX IF NOT EXISTS idx_underwrite_grid_bins ON underwrite_grid (down_pct_bin, rate_bps_bin, amort_months);

-- GIN index for JSONB metrics queries (if needed for filtering/sorting by metrics)
CREATE INDEX IF NOT EXISTS idx_underwrite_grid_metrics ON underwrite_grid USING GIN (metrics_json);

-- Exact cache (ad-hoc assumptions, per-request but memoized)
CREATE TABLE IF NOT EXISTS underwrite_exact (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  listing_version INT NOT NULL,
  assumptions_hash TEXT NOT NULL,
  metrics_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, listing_version, assumptions_hash)
);

-- Indexes for exact cache
CREATE INDEX IF NOT EXISTS idx_underwrite_exact_listing ON underwrite_exact (listing_id, listing_version);
CREATE INDEX IF NOT EXISTS idx_underwrite_exact_hash ON underwrite_exact (assumptions_hash);
CREATE INDEX IF NOT EXISTS idx_underwrite_exact_created ON underwrite_exact (created_at);

-- User assumptions (for storing custom assumption sets)
CREATE TABLE IF NOT EXISTS user_assumptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT, -- Optional: link to user system
  name TEXT NOT NULL,
  description TEXT,
  down_pct NUMERIC(6,4) NOT NULL CHECK (down_pct >= 0.05 AND down_pct <= 0.35),
  rate_bps INT NOT NULL CHECK (rate_bps >= 100 AND rate_bps <= 2000),
  amort_months INT NOT NULL CHECK (amort_months IN (240, 300, 360)),
  rent_scenario TEXT NOT NULL CHECK (rent_scenario IN ('P25', 'P50', 'P75')),
  mgmt_pct NUMERIC(6,4) CHECK (mgmt_pct >= 0 AND mgmt_pct <= 0.5),
  reserves_monthly NUMERIC(10,2) CHECK (reserves_monthly >= 0),
  exit_cap_pct NUMERIC(6,4) CHECK (exit_cap_pct > 0 AND exit_cap_pct <= 0.20),
  growth_rent_pct NUMERIC(6,4) CHECK (growth_rent_pct >= -0.1 AND growth_rent_pct <= 0.2),
  growth_expense_pct NUMERIC(6,4) CHECK (growth_expense_pct >= -0.1 AND growth_expense_pct <= 0.2),
  hold_years INT CHECK (hold_years >= 1 AND hold_years <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user assumptions
CREATE INDEX IF NOT EXISTS idx_user_assumptions_user ON user_assumptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_assumptions_created ON user_assumptions (created_at);

-- Computation log (optional: for monitoring and debugging)
CREATE TABLE IF NOT EXISTS computation_log (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  listing_version INT NOT NULL,
  computation_type TEXT NOT NULL CHECK (computation_type IN ('grid', 'exact')),
  rows_computed INT,
  duration_ms INT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for computation log
CREATE INDEX IF NOT EXISTS idx_computation_log_listing ON computation_log (listing_id, created_at);
CREATE INDEX IF NOT EXISTS idx_computation_log_type ON computation_log (computation_type, created_at);

-- Views for easier querying

-- View for latest grid computations per listing
CREATE OR REPLACE VIEW latest_grid_computations AS
SELECT DISTINCT ON (listing_id) 
  listing_id,
  listing_version,
  created_at,
  COUNT(*) OVER (PARTITION BY listing_id, listing_version) as grid_rows
FROM underwrite_grid
ORDER BY listing_id, created_at DESC;

-- View for grid metrics summary (example of useful aggregations)
CREATE OR REPLACE VIEW grid_metrics_summary AS
SELECT 
  listing_id,
  listing_version,
  rent_scenario,
  AVG((metrics_json->>'capRatePct')::NUMERIC) as avg_cap_rate,
  AVG((metrics_json->>'cashOnCashPct')::NUMERIC) as avg_coc,
  AVG((metrics_json->>'dscr')::NUMERIC) as avg_dscr,
  MIN((metrics_json->>'cashFlowAnnual')::NUMERIC) as min_cash_flow,
  MAX((metrics_json->>'cashFlowAnnual')::NUMERIC) as max_cash_flow,
  COUNT(*) as scenario_count
FROM underwrite_grid
GROUP BY listing_id, listing_version, rent_scenario;

-- Function to clean up old exact cache entries (optional maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_exact_cache(days_old INT DEFAULT 30)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM underwrite_exact 
  WHERE created_at < (now() - (days_old || ' days')::INTERVAL);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update listing_base from source tables (if using materialized approach)
CREATE OR REPLACE FUNCTION refresh_listing_base(p_listing_id TEXT DEFAULT NULL)
RETURNS INT AS $$
DECLARE
  updated_count INT := 0;
BEGIN
  -- This is a placeholder - actual implementation would depend on your source schema
  -- Example of what this might look like:
  /*
  INSERT INTO listing_base (
    listing_id, listing_version, price, closing_costs,
    noi_p25, noi_p50, noi_p75, city, province, property_type
  )
  SELECT 
    l.listing_id,
    l.listing_version,
    l.price,
    COALESCE(e.closing_costs, l.price * 0.015),
    COALESCE(r.rent_p25 * 12 - r.expenses_p25 * 12, 0),
    COALESCE(r.rent_p50 * 12 - r.expenses_p50 * 12, 0),
    COALESCE(r.rent_p75 * 12 - r.expenses_p75 * 12, 0),
    l.city, l.province, l.property_type
  FROM listings l
  LEFT JOIN enrichments e ON l.listing_id = e.listing_id
  LEFT JOIN rent_estimates r ON l.listing_id = r.listing_id
  WHERE (p_listing_id IS NULL OR l.listing_id = p_listing_id)
  ON CONFLICT (listing_id) DO UPDATE SET
    listing_version = EXCLUDED.listing_version,
    price = EXCLUDED.price,
    closing_costs = EXCLUDED.closing_costs,
    noi_p25 = EXCLUDED.noi_p25,
    noi_p50 = EXCLUDED.noi_p50,
    noi_p75 = EXCLUDED.noi_p75,
    city = EXCLUDED.city,
    province = EXCLUDED.province,
    property_type = EXCLUDED.property_type,
    updated_at = now();
  */
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Insert some common mortgage factors for performance
INSERT INTO mortgage_factors (rate_bps, amort_months, af) VALUES
  -- 20-year mortgages
  (300, 240, 0.005546), (350, 240, 0.005797), (400, 240, 0.006051),
  (450, 240, 0.006327), (500, 240, 0.006599), (550, 240, 0.006873),
  (600, 240, 0.007164), (650, 240, 0.007456), (700, 240, 0.007753),
  (750, 240, 0.008056), (800, 240, 0.008364),
  
  -- 25-year mortgages  
  (300, 300, 0.004742), (350, 300, 0.004989), (400, 300, 0.005241),
  (450, 300, 0.005498), (500, 300, 0.005760), (550, 300, 0.006027),
  (600, 300, 0.006299), (650, 300, 0.006576), (700, 300, 0.006858),
  (750, 300, 0.007144), (800, 300, 0.007436),
  
  -- 30-year mortgages
  (300, 360, 0.004216), (350, 360, 0.004461), (400, 360, 0.004711),
  (450, 360, 0.004967), (500, 360, 0.005368), (550, 360, 0.005634),
  (600, 360, 0.005996), (650, 360, 0.006272), (700, 360, 0.006653),
  (750, 360, 0.006940), (800, 360, 0.007234)
ON CONFLICT (rate_bps, amort_months) DO NOTHING;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uw_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO uw_app;

-- Initialize the ingestor database schema

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Listings table
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  mls_number TEXT,
  source_board TEXT NOT NULL,
  status TEXT NOT NULL,
  listed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  address JSONB NOT NULL,
  property_type TEXT NOT NULL,
  beds INT NOT NULL,
  baths INT NOT NULL,
  sqft INT,
  year_built INT,
  list_price NUMERIC NOT NULL,
  taxes_annual NUMERIC,
  condo_fee_monthly NUMERIC,
  media JSONB,
  brokerage JSONB,
  raw JSONB,
  updated_row_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sync state table for watermarks
CREATE TABLE IF NOT EXISTS sync_state (
  source TEXT PRIMARY KEY,
  watermark TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_updated_at ON listings(updated_at);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_source_board ON listings(source_board);
CREATE INDEX IF NOT EXISTS idx_listings_mls_number ON listings(mls_number) WHERE mls_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_address_city ON listings USING GIN ((address->>'city'));
CREATE INDEX IF NOT EXISTS idx_listings_property_type ON listings(property_type);
CREATE INDEX IF NOT EXISTS idx_listings_list_price ON listings(list_price);

-- Function to update updated_row_at timestamp
CREATE OR REPLACE FUNCTION update_updated_row_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_row_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_row_at
CREATE TRIGGER update_listings_updated_row_at 
    BEFORE UPDATE ON listings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_row_at();

-- Insert initial sync state if not exists
INSERT INTO sync_state (source, watermark) 
VALUES ('TRREB', '2024-01-01T00:00:00Z')
ON CONFLICT (source) DO NOTHING;

INSERT INTO sync_state (source, watermark) 
VALUES ('CREA', '2024-01-01T00:00:00Z')
ON CONFLICT (source) DO NOTHING;

INSERT INTO sync_state (source, watermark) 
VALUES ('MOCK', '2024-01-01T00:00:00Z')
ON CONFLICT (source) DO NOTHING;

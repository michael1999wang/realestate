-- Alerts service database schema

CREATE TABLE saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  filter_json JSONB NOT NULL,
  assumptions_id TEXT,
  thresholds_json JSONB NOT NULL,
  notify_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX saved_search_user_id ON saved_searches (user_id);
CREATE INDEX saved_search_city ON saved_searches ((filter_json->>'city'));
CREATE INDEX saved_search_province ON saved_searches ((filter_json->>'province'));
CREATE INDEX saved_search_property_type ON saved_searches ((filter_json->>'propertyType'));
CREATE INDEX saved_search_price ON saved_searches (((filter_json->>'maxPrice')::NUMERIC));
CREATE INDEX saved_search_beds ON saved_searches (((filter_json->>'minBeds')::INTEGER));
CREATE INDEX saved_search_active ON saved_searches (is_active) WHERE is_active = true;

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  saved_search_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  result_id TEXT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_json JSONB NOT NULL,
  delivery_json JSONB NOT NULL
);

CREATE INDEX alerts_user_id ON alerts (user_id);
CREATE INDEX alerts_listing_id ON alerts (listing_id);
CREATE INDEX alerts_triggered_at ON alerts (triggered_at);
CREATE INDEX alerts_saved_search_id ON alerts (saved_search_id);

-- Sample data for development
INSERT INTO saved_searches (id, user_id, name, filter_json, thresholds_json, notify_json, is_active) VALUES
('search-1', 'user-123', 'Toronto Condos', 
 '{"city": "Toronto", "province": "ON", "propertyType": "Condo", "maxPrice": 800000}',
 '{"minDSCR": 1.2, "minCoC": 0.08, "requireNonNegativeCF": true}',
 '{"channel": ["devbrowser", "email"]}',
 true),
('search-2', 'user-456', 'Vancouver Houses', 
 '{"city": "Vancouver", "province": "BC", "propertyType": "House", "minBeds": 3, "maxPrice": 1200000}',
 '{"minDSCR": 1.25, "minCapRate": 0.04, "minCoC": 0.10}',
 '{"channel": ["devbrowser", "slack"]}',
 true),
('search-3', 'user-789', 'Calgary Investment Props', 
 '{"city": "Calgary", "province": "AB", "maxPrice": 500000}',
 '{"minScore": 7.5, "requireNonNegativeCF": true}',
 '{"channel": ["devbrowser", "email", "sms"]}',
 true);

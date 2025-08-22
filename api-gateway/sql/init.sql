-- API Gateway Database Schema
-- Contains tables for user management, API keys, and gateway-specific data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication and authorization
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  api_requests_today INTEGER NOT NULL DEFAULT 0,
  api_quota_reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- API Keys table for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL, -- Human-readable name for the key
  key_hash VARCHAR(255) NOT NULL UNIQUE, -- Hashed API key
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE -- NULL means no expiration
);

-- User sessions table for web authentication
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gateway metrics table for monitoring
CREATE TABLE IF NOT EXISTS gateway_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metric_name VARCHAR(100) NOT NULL,
  metric_value NUMERIC NOT NULL,
  tags JSONB, -- Additional metadata as key-value pairs
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Request logs table for detailed logging (optional, for debugging)
CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(1000) NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  ip_address INET,
  user_agent TEXT,
  error_message TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_gateway_metrics_timestamp ON gateway_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_gateway_metrics_name ON gateway_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_gateway_metrics_tags ON gateway_metrics USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- View for user statistics
CREATE OR REPLACE VIEW user_stats AS
SELECT 
  u.id,
  u.email,
  u.subscription_tier,
  u.api_requests_today,
  u.created_at,
  COALESCE(ak.api_key_count, 0) as api_key_count,
  COALESCE(rl.request_count_today, 0) as request_count_today,
  COALESCE(rl.avg_response_time_today, 0) as avg_response_time_today
FROM users u
LEFT JOIN (
  SELECT user_id, COUNT(*) as api_key_count
  FROM api_keys 
  WHERE active = true
  GROUP BY user_id
) ak ON u.id = ak.user_id
LEFT JOIN (
  SELECT 
    user_id, 
    COUNT(*) as request_count_today,
    AVG(response_time_ms) as avg_response_time_today
  FROM request_logs 
  WHERE timestamp >= CURRENT_DATE
  GROUP BY user_id
) rl ON u.id = rl.user_id
WHERE u.active = true;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to reset daily API quotas
CREATE OR REPLACE FUNCTION reset_daily_quotas()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE users 
  SET 
    api_requests_today = 0,
    api_quota_reset_at = NOW() + INTERVAL '24 hours'
  WHERE api_quota_reset_at < NOW();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Seed data for development
-- Create a demo user if in development mode
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo@realestate.com') THEN
    INSERT INTO users (email, password_hash, subscription_tier)
    VALUES (
      'demo@realestate.com',
      -- bcrypt hash for 'demo123' - in production this would be properly hashed
      '$2b$12$LQv3c1yqBwlVHpgJneeVQOBTZjmGdUKwQ6JrGvKaWTF6Y7.YZfRE.',
      'pro'
    );
  END IF;
END
$$;

-- Create demo API key
DO $$
DECLARE
  demo_user_id UUID;
BEGIN
  SELECT id INTO demo_user_id FROM users WHERE email = 'demo@realestate.com';
  
  IF demo_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM api_keys WHERE user_id = demo_user_id AND name = 'Demo API Key'
  ) THEN
    INSERT INTO api_keys (user_id, name, key_hash)
    VALUES (
      demo_user_id,
      'Demo API Key',
      -- This would be a hash of an actual API key in production
      'demo_api_key_hash_123'
    );
  END IF;
END
$$;

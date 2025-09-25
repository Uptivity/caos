-- CAOS CRM Database Initialization Script for MySQL 8.0
-- This script creates the production database schema

-- Set MySQL modes for compatibility
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- Use the database (already created by Docker environment variables)
USE caos_crm;

-- Create Users table
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    is_active TINYINT(1) DEFAULT 1,
    email_verified TINYINT(1) DEFAULT 0,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create Leads table
CREATE TABLE IF NOT EXISTS leads (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(200),
    position VARCHAR(100),
    status VARCHAR(50) DEFAULT 'new',
    source VARCHAR(100),
    score INTEGER DEFAULT 0,
    notes TEXT,
    assigned_to CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- Create Lead Activities table
CREATE TABLE IF NOT EXISTS lead_activities (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    lead_id CHAR(36) NOT NULL,
    user_id CHAR(36),
    activity_type VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'email',
    status VARCHAR(50) DEFAULT 'draft',
    subject VARCHAR(500),
    content TEXT,
    scheduled_at TIMESTAMP NULL,
    sent_at TIMESTAMP NULL,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Create Campaign Recipients table
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    campaign_id CHAR(36) NOT NULL,
    lead_id CHAR(36) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP NULL,
    opened_at TIMESTAMP NULL,
    clicked_at TIMESTAMP NULL,
    bounced_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

-- Create Products table
CREATE TABLE IF NOT EXISTS products (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    price DECIMAL(10,2),
    cost DECIMAL(10,2),
    sku VARCHAR(100) UNIQUE,
    stock_quantity INTEGER DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(50) DEFAULT 'medium',
    due_date TIMESTAMP NULL,
    assigned_to CHAR(36),
    created_by CHAR(36),
    related_lead_id CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (related_lead_id) REFERENCES leads(id)
);

-- Create Calendar Events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    location VARCHAR(500),
    event_type VARCHAR(50) DEFAULT 'meeting',
    status VARCHAR(50) DEFAULT 'scheduled',
    created_by CHAR(36),
    related_lead_id CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (related_lead_id) REFERENCES leads(id)
);

-- Create Teams table
CREATE TABLE IF NOT EXISTS teams (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    team_type VARCHAR(50) DEFAULT 'department',
    parent_team_id CHAR(36),
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_team_id) REFERENCES teams(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Create Team Members table
CREATE TABLE IF NOT EXISTS team_members (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    team_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_team_user (team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create Documents table
CREATE TABLE IF NOT EXISTS documents (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    version INTEGER DEFAULT 1,
    folder_path VARCHAR(500) DEFAULT '/',
    uploaded_by CHAR(36),
    shared_with JSON DEFAULT JSON_ARRAY(),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Create Settings table
CREATE TABLE IF NOT EXISTS settings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    category VARCHAR(100) NOT NULL,
    key_name VARCHAR(100) NOT NULL,
    value JSON,
    user_id CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_category_key_user (category, key_name, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create Analytics Events table (for tracking)
CREATE TABLE IF NOT EXISTS analytics_events (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    event_type VARCHAR(100) NOT NULL,
    event_data JSON,
    user_id CHAR(36),
    session_id VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create Session Storage table (for Redis fallback)
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    session_data JSON,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON lead_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_lead ON campaign_recipients(lead_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_created_by ON calendar_events(created_by);
CREATE INDEX IF NOT EXISTS idx_teams_parent ON teams(parent_team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_path);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key_name);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- Insert default admin user (password: admin123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, email_verified)
VALUES (
    UUID(),
    'admin@caoscrm.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LdFUfaRnqKfLgWWUy', -- admin123
    'System',
    'Administrator',
    'admin',
    1,
    1
) ON DUPLICATE KEY UPDATE email = email;

-- Insert sample data for demonstration
INSERT INTO leads (id, first_name, last_name, email, company, status, source, score) VALUES
    (UUID(), 'John', 'Doe', 'john.doe@example.com', 'Tech Corp', 'new', 'website', 85),
    (UUID(), 'Jane', 'Smith', 'jane.smith@example.com', 'Marketing Inc', 'qualified', 'referral', 92),
    (UUID(), 'Bob', 'Johnson', 'bob.j@example.com', 'Sales Solutions', 'contacted', 'social_media', 78)
ON DUPLICATE KEY UPDATE first_name = first_name;

INSERT INTO products (id, name, description, category, price, cost, sku, stock_quantity) VALUES
    (UUID(), 'CRM Professional', 'Full-featured CRM solution', 'Software', 99.99, 30.00, 'CRM-PRO-001', 100),
    (UUID(), 'Analytics Dashboard', 'Advanced analytics and reporting', 'Software', 149.99, 45.00, 'ANA-DASH-001', 75),
    (UUID(), 'Mobile App License', 'Mobile CRM application access', 'Software', 29.99, 10.00, 'MOB-APP-001', 200)
ON DUPLICATE KEY UPDATE name = name;

-- Create user for application access
CREATE USER IF NOT EXISTS 'caos_user'@'%' IDENTIFIED BY 'changeme123';
GRANT ALL PRIVILEGES ON caos_crm.* TO 'caos_user'@'%';
FLUSH PRIVILEGES;

-- Optimize tables
ANALYZE TABLE users, leads, lead_activities, campaigns, campaign_recipients, products, tasks, calendar_events, teams, team_members, documents, settings, analytics_events, user_sessions;
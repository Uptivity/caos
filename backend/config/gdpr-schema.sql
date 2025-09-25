-- GDPR Compliance Database Schema
-- Tables for audit logging, consent management, and data retention

-- Create audit_logs table for tracking all data access and modifications
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100),
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    endpoint VARCHAR(255),
    method VARCHAR(10),
    session_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_table_record (table_name, record_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create user_consents table for GDPR consent tracking
CREATE TABLE IF NOT EXISTS user_consents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    consent_type ENUM('data_processing', 'marketing', 'analytics', 'cookies', 'third_party_sharing') NOT NULL,
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    consent_text TEXT NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    ip_address VARCHAR(45),
    user_agent TEXT,
    consent_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    withdrawal_date TIMESTAMP NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    legal_basis ENUM('consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests') NOT NULL DEFAULT 'consent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_consent_type (consent_type),
    INDEX idx_is_active (is_active),
    INDEX idx_consent_date (consent_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_consent (user_id, consent_type, version, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create data_retention_policies table
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    retention_period_days INT NOT NULL,
    retention_criteria JSON,
    auto_delete BOOLEAN NOT NULL DEFAULT FALSE,
    last_cleanup TIMESTAMP NULL,
    created_by INT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_table_name (table_name),
    INDEX idx_is_active (is_active),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_table_policy (table_name, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create data_deletion_requests table for tracking GDPR deletion requests
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    email VARCHAR(255) NOT NULL,
    request_type ENUM('full_deletion', 'partial_deletion', 'anonymization') NOT NULL DEFAULT 'full_deletion',
    status ENUM('pending', 'in_progress', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    requested_data JSON,
    deletion_reason TEXT,
    verification_token VARCHAR(255),
    verified_at TIMESTAMP NULL,
    processed_by INT,
    processed_at TIMESTAMP NULL,
    completion_notes TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_verification_token (verification_token),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create data_export_requests table for tracking GDPR data export requests
CREATE TABLE IF NOT EXISTS data_export_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    request_type ENUM('full_export', 'partial_export') NOT NULL DEFAULT 'full_export',
    status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    export_format ENUM('json', 'csv', 'xml') NOT NULL DEFAULT 'json',
    requested_data JSON,
    file_path VARCHAR(500),
    file_size BIGINT,
    expires_at TIMESTAMP,
    download_count INT NOT NULL DEFAULT 0,
    max_downloads INT NOT NULL DEFAULT 3,
    verification_token VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_verification_token (verification_token),
    INDEX idx_expires_at (expires_at),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create privacy_settings table for user privacy preferences
CREATE TABLE IF NOT EXISTS privacy_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSON NOT NULL,
    description TEXT,
    last_updated_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_setting_key (setting_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (last_updated_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_setting (user_id, setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default data retention policies
INSERT INTO data_retention_policies (table_name, retention_period_days, retention_criteria, auto_delete, created_at)
VALUES
    ('audit_logs', 2555, '{"type": "audit_data", "category": "system_logs"}', true, NOW()),
    ('user_consents', -1, '{"type": "consent_records", "permanent": true}', false, NOW()),
    ('data_deletion_requests', 1095, '{"type": "deletion_records", "keep_for_compliance": true}', false, NOW()),
    ('data_export_requests', 365, '{"type": "export_records", "cleanup_files": true}', true, NOW())
ON DUPLICATE KEY UPDATE
    retention_period_days = VALUES(retention_period_days),
    updated_at = NOW();

-- Insert default consent types and templates
INSERT INTO user_consents (user_id, consent_type, consent_given, consent_text, version, legal_basis, is_active)
SELECT
    u.id,
    'data_processing',
    true,
    'I consent to the processing of my personal data for the purpose of providing CRM services, managing my account, and fulfilling contractual obligations.',
    '1.0',
    'contract',
    true
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM user_consents uc
    WHERE uc.user_id = u.id
    AND uc.consent_type = 'data_processing'
    AND uc.is_active = true
);

-- Add GDPR compliance fields to users table if they don't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS gdpr_consent_date TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS data_retention_until TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS anonymization_date TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS gdpr_status ENUM('active', 'deletion_requested', 'deleted', 'anonymized') NOT NULL DEFAULT 'active',
ADD INDEX IF NOT EXISTS idx_gdpr_status (gdpr_status),
ADD INDEX IF NOT EXISTS idx_data_retention_until (data_retention_until);
-- AFT Postgres 17 schema (initial)
--
-- All timestamps are stored as BIGINT unix epoch seconds to match the
-- existing application code, which converts them to JS dates with
-- `new Date(value * 1000)`.

-- Schema migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id                   BIGSERIAL PRIMARY KEY,
    email                TEXT UNIQUE NOT NULL,
    password             TEXT NOT NULL,
    first_name           TEXT NOT NULL,
    last_name            TEXT NOT NULL,
    primary_role         TEXT NOT NULL,
    organization         TEXT,
    phone                TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at           BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- User Roles junction
CREATE TABLE IF NOT EXISTS user_roles (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT    NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_by BIGINT  REFERENCES users(id),
    created_at  BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    session_id       TEXT PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    email            TEXT NOT NULL,
    primary_role     TEXT NOT NULL,
    active_role      TEXT,
    available_roles  TEXT NOT NULL,
    created_at       BIGINT NOT NULL,
    last_activity    BIGINT NOT NULL,
    ip_address       TEXT,
    user_agent       TEXT,
    csrf_token       TEXT NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    role_selected    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);

-- Security audit log
CREATE TABLE IF NOT EXISTS security_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT,
    action          TEXT NOT NULL,
    description     TEXT NOT NULL,
    ip_address      TEXT,
    user_agent      TEXT,
    additional_data TEXT,
    timestamp       BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_timestamp ON security_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_action ON security_audit_log(action);

-- Media drives (Media Custodian inventory)
CREATE TABLE IF NOT EXISTS media_drives (
    id                   BIGSERIAL PRIMARY KEY,
    serial_number        TEXT UNIQUE NOT NULL,
    media_control_number TEXT,
    type                 TEXT NOT NULL,
    model                TEXT NOT NULL,
    capacity             TEXT NOT NULL,
    location             TEXT,
    status               TEXT NOT NULL DEFAULT 'available',
    issued_to_user_id    BIGINT REFERENCES users(id),
    issued_at            BIGINT,
    returned_at          BIGINT,
    purpose              TEXT,
    last_used            BIGINT,
    created_at           BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at           BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- AFT requests (the main workflow table)
CREATE TABLE IF NOT EXISTS aft_requests (
    id                              BIGSERIAL PRIMARY KEY,
    request_number                  TEXT UNIQUE NOT NULL,
    requestor_id                    BIGINT NOT NULL REFERENCES users(id),
    approver_id                     BIGINT REFERENCES users(id),
    approver_email                  TEXT,
    dta_id                          BIGINT REFERENCES users(id),
    sme_id                          BIGINT REFERENCES users(id),
    assigned_sme_id                 BIGINT REFERENCES users(id),
    media_custodian_id              BIGINT REFERENCES users(id),

    tpi_required                    BOOLEAN NOT NULL DEFAULT TRUE,
    tpi_maintained                  BOOLEAN NOT NULL DEFAULT FALSE,
    status                          TEXT NOT NULL DEFAULT 'draft',
    signature_method                TEXT DEFAULT 'manual',
    submitted_at                    BIGINT,
    priority                        TEXT DEFAULT 'normal',

    requestor_name                  TEXT NOT NULL,
    requestor_org                   TEXT NOT NULL,
    requestor_phone                 TEXT NOT NULL,
    requestor_email                 TEXT NOT NULL,

    transfer_purpose                TEXT NOT NULL,
    transfer_type                   TEXT NOT NULL,
    classification                  TEXT NOT NULL,
    caveat_info                     TEXT,
    data_description                TEXT NOT NULL,
    description                     TEXT,
    justification                   TEXT,

    source_system                   TEXT,
    source_location                 TEXT,
    source_contact                  TEXT,
    source_phone                    TEXT,
    source_email                    TEXT,

    dest_system                     TEXT,
    dest_location                   TEXT,
    dest_contact                    TEXT,
    dest_phone                      TEXT,
    dest_email                      TEXT,

    data_format                     TEXT,
    data_size                       TEXT,
    transfer_method                 TEXT,
    encryption                      TEXT,
    compression_required            BOOLEAN,

    files_list                      TEXT,
    additional_file_list_attached   BOOLEAN NOT NULL DEFAULT FALSE,
    file_name                       TEXT,
    file_size                       TEXT,
    file_type                       TEXT,
    file_hash                       TEXT,

    selected_drive_id               BIGINT REFERENCES media_drives(id),

    requested_start_date            BIGINT,
    requested_end_date              BIGINT,
    urgency_level                   TEXT,
    actual_start_date               BIGINT,
    actual_end_date                 BIGINT,

    transfer_notes                  TEXT,
    transfer_data                   TEXT,
    verification_type               TEXT,
    verification_results            TEXT,

    approval_date                   BIGINT,
    approval_notes                  TEXT,
    approval_data                   TEXT,
    rejection_reason                TEXT,

    -- Section IV - Anti-virus scan
    origination_scan_performed      BOOLEAN NOT NULL DEFAULT FALSE,
    origination_scan_status         TEXT DEFAULT 'pending',
    origination_files_scanned       INTEGER,
    origination_threats_found       INTEGER NOT NULL DEFAULT 0,
    destination_scan_performed      BOOLEAN NOT NULL DEFAULT FALSE,
    destination_scan_status         TEXT DEFAULT 'pending',
    destination_files_scanned       INTEGER,
    destination_threats_found       INTEGER NOT NULL DEFAULT 0,

    -- Transfer completion
    transfer_completed_date         BIGINT,
    files_transferred_count         INTEGER,
    dta_signature_date              BIGINT,
    sme_signature_date              BIGINT,

    -- Section V - Media disposition
    disposition_optical_destroyed   TEXT,
    disposition_optical_retained    TEXT,
    disposition_ssd_sanitized       TEXT,
    disposition_custodian_name      TEXT,
    disposition_date                BIGINT,
    disposition_signature           TEXT,
    disposition_notes               TEXT,
    disposition_completed_at        BIGINT,
    additional_systems              TEXT,

    created_at                      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at                      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_aft_requests_status ON aft_requests(status);
CREATE INDEX IF NOT EXISTS idx_aft_requests_requestor_id ON aft_requests(requestor_id);
CREATE INDEX IF NOT EXISTS idx_aft_requests_dta_id ON aft_requests(dta_id);
CREATE INDEX IF NOT EXISTS idx_aft_requests_assigned_sme_id ON aft_requests(assigned_sme_id);
CREATE INDEX IF NOT EXISTS idx_aft_requests_updated_at ON aft_requests(updated_at);

-- AFT audit log
CREATE TABLE IF NOT EXISTS aft_audit_log (
    id          BIGSERIAL PRIMARY KEY,
    request_id  BIGINT REFERENCES aft_requests(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    action      TEXT NOT NULL,
    old_status  TEXT,
    new_status  TEXT,
    changes     TEXT,
    notes       TEXT,
    created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_aft_audit_log_request_id ON aft_audit_log(request_id);

-- AFT request history (user-friendly action log)
CREATE TABLE IF NOT EXISTS aft_request_history (
    id          BIGSERIAL PRIMARY KEY,
    request_id  BIGINT NOT NULL REFERENCES aft_requests(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    user_email  TEXT NOT NULL,
    notes       TEXT,
    old_value   TEXT,
    new_value   TEXT,
    created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_aft_request_history_request_id ON aft_request_history(request_id);

-- CAC signatures
CREATE TABLE IF NOT EXISTS cac_signatures (
    id                       BIGSERIAL PRIMARY KEY,
    request_id               BIGINT NOT NULL REFERENCES aft_requests(id) ON DELETE CASCADE,
    user_id                  BIGINT NOT NULL REFERENCES users(id),
    step_type                TEXT NOT NULL,
    certificate_subject      TEXT NOT NULL,
    certificate_issuer       TEXT NOT NULL,
    certificate_serial       TEXT NOT NULL,
    certificate_thumbprint   TEXT NOT NULL,
    certificate_not_before   BIGINT NOT NULL,
    certificate_not_after    BIGINT NOT NULL,
    signature_data           TEXT NOT NULL,
    signed_data              TEXT NOT NULL,
    signature_algorithm      TEXT DEFAULT 'RSA-SHA256',
    signature_reason         TEXT,
    signature_location       TEXT,
    ip_address               TEXT,
    user_agent               TEXT,
    is_verified              BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at              BIGINT,
    verification_notes       TEXT,
    created_at               BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_cac_signatures_request_id ON cac_signatures(request_id);
CREATE INDEX IF NOT EXISTS idx_cac_signatures_user_id ON cac_signatures(user_id);

-- CAC certificates (per-user cert registry, used by lib/cac-server-auth.ts)
CREATE TABLE IF NOT EXISTS cac_certificates (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id),
    subject       TEXT NOT NULL,
    issuer        TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    fingerprint   TEXT NOT NULL UNIQUE,
    valid_from    BIGINT NOT NULL,
    valid_to      BIGINT NOT NULL,
    pem_data      TEXT,
    created_at    BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at    BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- CAC trust store (DOD root/intermediate CAs)
CREATE TABLE IF NOT EXISTS cac_trust_store (
    id                     BIGSERIAL PRIMARY KEY,
    certificate_name       TEXT NOT NULL,
    certificate_data       TEXT NOT NULL,
    certificate_thumbprint TEXT UNIQUE NOT NULL,
    issuer_dn              TEXT NOT NULL,
    subject_dn             TEXT NOT NULL,
    not_before             BIGINT NOT NULL,
    not_after              BIGINT NOT NULL,
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    is_root_ca             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at             BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- Manual signatures (used when a user signs without a CAC)
CREATE TABLE IF NOT EXISTS manual_signatures (
    id                      BIGSERIAL PRIMARY KEY,
    request_id              BIGINT NOT NULL REFERENCES aft_requests(id) ON DELETE CASCADE,
    signer_id               BIGINT NOT NULL REFERENCES users(id),
    signer_email            TEXT NOT NULL,
    signature_text          TEXT NOT NULL,
    certification_statement TEXT NOT NULL,
    signature_timestamp     TEXT NOT NULL,
    ip_address              TEXT,
    created_at              BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_manual_signatures_request_id ON manual_signatures(request_id);

-- System settings KV
CREATE TABLE IF NOT EXISTS system_settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT,
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- Email notification log
CREATE TABLE IF NOT EXISTS notification_log (
    id         BIGSERIAL PRIMARY KEY,
    request_id BIGINT,
    recipient  TEXT NOT NULL,
    subject    TEXT NOT NULL,
    status     TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
    message_id TEXT,
    error      TEXT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_notification_log_request_id ON notification_log(request_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient  ON notification_log(recipient);
CREATE INDEX IF NOT EXISTS idx_notification_log_status     ON notification_log(status);

-- User-level notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id              BIGINT PRIMARY KEY REFERENCES users(id),
    email_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_assignment BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_approval   BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_rejection  BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_completion BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at           BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

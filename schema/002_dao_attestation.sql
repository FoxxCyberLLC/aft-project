-- Migration 002: DAO out-of-band attestation
--
-- The DAO (Designated Authorizing Official) is a government role that signs
-- the AFT request form on the unclassified side and never logs into this
-- application. We capture their approval as an attestation on the request
-- itself, populated by the requestor at submission time. The dao_* columns
-- below carry the attestation; for high-to-low transfers the API enforces
-- that they are populated before the request leaves draft.
--
-- The previous workflow had a `pending_dao` status that no API ever
-- advanced, so any high-to-low request would silently get stuck. This
-- migration also moves any existing rows in that state forward to
-- pending_approver so they can resume.

ALTER TABLE aft_requests
    ADD COLUMN IF NOT EXISTS dao_approved        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dao_approver_name   TEXT,
    ADD COLUMN IF NOT EXISTS dao_approval_date   BIGINT;

UPDATE aft_requests
   SET status = 'pending_approver'
 WHERE status = 'pending_dao';

// Postgres-backed database module for AFT.
//
// This module replaces the previous bun:sqlite implementation. It exposes a
// thin wrapper around Bun's native Postgres client (`Bun.sql`) that mimics
// the bun:sqlite chained API:
//
//   const row = await db.query("SELECT ... WHERE id = ?").get(id);
//   const rows = await db.query("SELECT ...").all();
//   const r   = await db.query("INSERT ... RETURNING id").run(a, b);
//
// The terminator methods (`get`, `all`, `run`) return Promises and MUST be
// awaited. The wrapper auto-translates `?` placeholders to `$1, $2, ...` so
// most existing call sites only need to add `await`.
//
// Connection string is taken from `DATABASE_URL`, e.g.
//   postgres://aft:aft@127.0.0.1:5432/aft

import { SQL } from "bun";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Enums and helper types (unchanged from the SQLite version)
// ---------------------------------------------------------------------------

export const UserRole = {
  ADMIN: 'admin',
  REQUESTOR: 'requestor',
  DAO: 'dao',
  APPROVER: 'approver',
  CPSO: 'cpso',
  DTA: 'dta',
  SME: 'sme',
  MEDIA_CUSTODIAN: 'media_custodian'
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

export const AFTStatus = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PENDING_DAO: 'pending_dao',
  PENDING_APPROVER: 'pending_approver',
  PENDING_CPSO: 'pending_cpso',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PENDING_DTA: 'pending_dta',
  ACTIVE_TRANSFER: 'active_transfer',
  PENDING_SME_SIGNATURE: 'pending_sme_signature',
  PENDING_SME: 'pending_sme',
  PENDING_MEDIA_CUSTODIAN: 'pending_media_custodian',
  COMPLETED: 'completed',
  DISPOSED: 'disposed',
  CANCELLED: 'cancelled'
} as const;

export const AFT_STATUS_LABELS = {
  [AFTStatus.DRAFT]: 'Draft',
  [AFTStatus.SUBMITTED]: 'Submitted',
  [AFTStatus.PENDING_DAO]: 'Pending DAO Review',
  [AFTStatus.PENDING_APPROVER]: 'Pending ISSM Review',
  [AFTStatus.PENDING_CPSO]: 'Pending CPSO Review',
  [AFTStatus.APPROVED]: 'Approved',
  [AFTStatus.REJECTED]: 'Rejected',
  [AFTStatus.PENDING_DTA]: 'Pending DTA Processing',
  [AFTStatus.ACTIVE_TRANSFER]: 'Transfer in Progress',
  [AFTStatus.PENDING_SME_SIGNATURE]: 'Pending SME Signature',
  [AFTStatus.PENDING_SME]: 'Pending SME Review',
  [AFTStatus.PENDING_MEDIA_CUSTODIAN]: 'Pending Media Disposition',
  [AFTStatus.COMPLETED]: 'Completed',
  [AFTStatus.DISPOSED]: 'Media Disposed',
  [AFTStatus.CANCELLED]: 'Cancelled'
} as const;

export type AFTStatusType = typeof AFTStatus[keyof typeof AFTStatus];

// ---------------------------------------------------------------------------
// Postgres connection
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://aft:aft@127.0.0.1:5432/aft';

export const sql = new SQL(DATABASE_URL, {
  max: 10,
  idleTimeout: 30
});

// Convert bun:sqlite-style `?` placeholders to Postgres `$1, $2, ...`. We do
// not attempt to parse SQL strings; the assumption is that `?` only appears
// as a placeholder. None of the queries in this codebase use `?` inside
// string literals or comments.
function convertPlaceholders(text: string): string {
  let n = 0;
  return text.replace(/\?/g, () => `$${++n}`);
}

interface RunResult {
  /** ID returned by `INSERT ... RETURNING id`, if present. */
  lastInsertRowid: number | undefined;
  /** Number of rows affected (or returned). */
  changes: number;
}

class Query {
  constructor(private text: string) {}

  async get<T = any>(...params: any[]): Promise<T | undefined> {
    const text = convertPlaceholders(this.text);
    const result = await sql.unsafe(text, params);
    return (result as any[])[0] as T | undefined;
  }

  async all<T = any>(...params: any[]): Promise<T[]> {
    const text = convertPlaceholders(this.text);
    const result = await sql.unsafe(text, params);
    return result as unknown as T[];
  }

  async run(...params: any[]): Promise<RunResult> {
    const text = convertPlaceholders(this.text);
    const result = await sql.unsafe(text, params) as any;
    const firstRow = Array.isArray(result) ? result[0] : undefined;
    let lastInsertRowid: number | undefined;
    if (firstRow && firstRow.id !== undefined && firstRow.id !== null) {
      lastInsertRowid = Number(firstRow.id);
    }
    const changes =
      typeof result?.count === 'number' ? result.count
      : Array.isArray(result) ? result.length
      : 0;
    return { lastInsertRowid, changes };
  }
}

class TxQuery {
  constructor(private text: string, private tx: any) {}

  async get<T = any>(...params: any[]): Promise<T | undefined> {
    const text = convertPlaceholders(this.text);
    const result = await this.tx.unsafe(text, params);
    return (result as any[])[0] as T | undefined;
  }

  async all<T = any>(...params: any[]): Promise<T[]> {
    const text = convertPlaceholders(this.text);
    const result = await this.tx.unsafe(text, params);
    return result as unknown as T[];
  }

  async run(...params: any[]): Promise<RunResult> {
    const text = convertPlaceholders(this.text);
    const result = await this.tx.unsafe(text, params) as any;
    const firstRow = Array.isArray(result) ? result[0] : undefined;
    let lastInsertRowid: number | undefined;
    if (firstRow && firstRow.id !== undefined && firstRow.id !== null) {
      lastInsertRowid = Number(firstRow.id);
    }
    const changes =
      typeof result?.count === 'number' ? result.count
      : Array.isArray(result) ? result.length
      : 0;
    return { lastInsertRowid, changes };
  }
}

/**
 * A transaction-bound Db facade. All `query/exec` calls go through the same
 * connection inside the active `sql.begin` block, so the entire callback is
 * atomic and isolation guarantees apply.
 */
export class TxDb {
  constructor(private tx: any) {}

  query(text: string): TxQuery {
    return new TxQuery(text, this.tx);
  }

  prepare(text: string): TxQuery {
    return new TxQuery(text, this.tx);
  }

  async exec(text: string): Promise<void> {
    await this.tx.unsafe(text);
  }
}

class Db {
  query(text: string): Query {
    return new Query(text);
  }

  prepare(text: string): Query {
    return new Query(text);
  }

  /**
   * Execute one or more SQL statements with no parameters. Used for schema
   * setup and maintenance.
   */
  async exec(text: string): Promise<void> {
    await sql.unsafe(text);
  }

  /**
   * Run an async callback inside a Postgres transaction. The callback
   * receives a `TxDb` whose `query/exec` methods route through the
   * transactional connection, so writes are properly atomic.
   *
   * Usage:
   *   const id = await db.withTransaction(async (tx) => {
   *     const r = await tx.query("INSERT ... RETURNING id").run(...);
   *     await tx.query("UPDATE ...").run(...);
   *     return r.lastInsertRowid;
   *   });
   */
  async withTransaction<T>(fn: (tx: TxDb) => Promise<T>): Promise<T> {
    return await sql.begin(async (tx) => {
      const txDb = new TxDb(tx);
      return await fn(txDb);
    }) as T;
  }

  /**
   * Backwards-compatible wrapper for code that used the bun:sqlite
   * `db.transaction(fn)()` pattern. Prefer `withTransaction` for new code.
   */
  transaction<T>(fn: (...args: any[]) => T | Promise<T>) {
    return async (...args: any[]) => {
      return await sql.begin(async () => fn(...args));
    };
  }
}

const db = new Db();

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Returns the (singleton) database wrapper. The first call kicks off schema
 * initialization in the background; the wrapper's methods are async so they
 * naturally serialize after the first migration completes via `await
 * waitForReady()` from anywhere that needs strict ordering.
 */
export function getDb(): Db {
  if (!initialized) {
    initialized = true;
    initPromise = initializeSchema().catch(err => {
      console.error('Failed to initialize schema:', err);
      throw err;
    });
  }
  return db;
}

/**
 * Await this once during application startup (e.g. before `Bun.serve`) to
 * guarantee migrations and the bootstrap admin have been applied.
 */
export async function waitForReady(): Promise<void> {
  if (!initialized) {
    getDb();
  }
  if (initPromise) await initPromise;
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

async function initializeSchema(): Promise<void> {
  // Ensure schema_migrations table exists.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    )
  `);

  const schemaDir = path.resolve('./schema');
  if (fs.existsSync(schemaDir)) {
    const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const applied = await sql.unsafe(
        `SELECT version FROM schema_migrations WHERE version = $1`,
        [version]
      ) as any[];
      if (applied.length > 0) continue;

      const content = fs.readFileSync(path.join(schemaDir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx.unsafe(
          `INSERT INTO schema_migrations (version) VALUES ($1)`,
          [version]
        );
      });
      console.log(`Applied schema migration: ${version}`);
    }
  } else {
    console.warn('schema/ directory not found - skipping migrations');
  }

  await initializeBootstrapAdmin();
}

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 12
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

export async function setUserPassword(userId: number, plainPassword: string): Promise<void> {
  const hash = await hashPassword(plainPassword);
  await sql`
    UPDATE users
    SET password = ${hash},
        must_change_password = FALSE,
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = ${userId}
  `;
}

// ---------------------------------------------------------------------------
// Bootstrap admin
// ---------------------------------------------------------------------------

async function initializeBootstrapAdmin(): Promise<void> {
  try {
    const existing = await sql`
      SELECT 1 FROM users WHERE primary_role = 'admin' LIMIT 1
    ` as any[];
    if (existing.length > 0) return;

    const bootstrap = process.env.AFT_ADMIN_BOOTSTRAP_PASSWORD || '';
    const bootstrapEmail = process.env.AFT_ADMIN_BOOTSTRAP_EMAIL || 'admin@aft.gov';

    if (!bootstrap) {
      console.warn('No admin user exists and AFT_ADMIN_BOOTSTRAP_PASSWORD is not set.');
      console.warn('Set both AFT_ADMIN_BOOTSTRAP_EMAIL and AFT_ADMIN_BOOTSTRAP_PASSWORD on first boot to seed an initial admin.');
      return;
    }

    if (bootstrap.length < 12) {
      throw new Error('AFT_ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters');
    }

    const hashedPassword = await hashPassword(bootstrap);

    const inserted = await sql`
      INSERT INTO users
        (email, password, first_name, last_name, primary_role, is_active,
         organization, phone, must_change_password)
      VALUES
        (${bootstrapEmail}, ${hashedPassword}, 'System', 'Administrator', 'admin',
         TRUE, 'System', 'N/A', TRUE)
      RETURNING id
    ` as any[];

    const adminId = inserted[0]?.id;
    if (adminId === undefined) {
      throw new Error('Failed to insert bootstrap admin user');
    }

    await sql`
      INSERT INTO user_roles (user_id, role, is_active, assigned_by)
      VALUES (${adminId}, 'admin', TRUE, ${adminId})
    `;

    delete process.env.AFT_ADMIN_BOOTSTRAP_PASSWORD;

    console.log(`Created bootstrap admin user (${bootstrapEmail}) - password change required at first login.`);
  } catch (error) {
    console.error('Bootstrap admin initialization failed:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Misc helpers (unchanged in spirit, ported to Postgres)
// ---------------------------------------------------------------------------

export function generateRequestNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AFT-${timestamp}-${random}`;
}

export async function getUserRoles(userId: number): Promise<Array<{ role: UserRoleType; isPrimary: boolean }>> {
  const userRow = await sql`
    SELECT primary_role FROM users WHERE id = ${userId} AND is_active = TRUE
  ` as any[];
  if (userRow.length === 0) return [];
  const user = userRow[0];

  let userRoles = await sql`
    SELECT role FROM user_roles
    WHERE user_id = ${userId} AND is_active = TRUE
    ORDER BY created_at ASC
  ` as Array<{ role: UserRoleType }>;

  if (user.primary_role === UserRole.MEDIA_CUSTODIAN) {
    userRoles = userRoles.filter(ur => ur.role !== UserRole.REQUESTOR);
  }

  const rolesWithFlags = userRoles.map(ur => ({
    role: ur.role,
    isPrimary: ur.role === user.primary_role
  }));

  if (!rolesWithFlags.some(r => r.isPrimary)) {
    if (!(user.primary_role === UserRole.REQUESTOR && user.primary_role !== UserRole.MEDIA_CUSTODIAN)) {
      rolesWithFlags.unshift({
        role: user.primary_role,
        isPrimary: true
      });
    }
  }

  return rolesWithFlags;
}

/**
 * Postgres equivalent of pg_dump → file. Spawns the system `pg_dump` binary
 * (bundled in the AFT container alongside Postgres). The DATABASE_URL is
 * passed via env so credentials never appear on the command line.
 */
export async function backupDatabase(): Promise<string> {
  const backupDir = './data/backups';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `aft-backup-${timestamp}.sql`;
  const backupPath = `${backupDir}/${backupFileName}`;

  const proc = Bun.spawn(['pg_dump', '--format=plain', '--no-owner', '--no-privileges'], {
    env: { ...process.env, PGURL: DATABASE_URL, DATABASE_URL },
    stdout: Bun.file(backupPath).writer() as any,
    stderr: 'pipe'
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`pg_dump failed (exit ${exitCode}): ${stderr}`);
  }
  return backupPath;
}

export async function runMaintenance(): Promise<void> {
  await sql.unsafe('VACUUM (ANALYZE)');
}

export function getRoleDisplayName(role: UserRoleType): string {
  const roleNames = {
    [UserRole.ADMIN]: 'System Administrator',
    [UserRole.REQUESTOR]: 'Request Submitter',
    [UserRole.DAO]: 'Designated Authorizing Official',
    [UserRole.APPROVER]: 'Information System Security Manager',
    [UserRole.CPSO]: 'Contractor Program Security Officer',
    [UserRole.DTA]: 'Data Transfer Agent',
    [UserRole.SME]: 'Subject Matter Expert',
    [UserRole.MEDIA_CUSTODIAN]: 'Media Custodian'
  };
  return roleNames[role] || role;
}

export function getRoleDescription(role: UserRoleType): string {
  const roleDescriptions = {
    [UserRole.ADMIN]: 'Full system administration and user management',
    [UserRole.REQUESTOR]: 'Submit and track AFT requests',
    [UserRole.DAO]: 'Approve requests for high-to-low transfers',
    [UserRole.APPROVER]: 'Security review and approval of requests',
    [UserRole.CPSO]: 'Contractor security oversight and approval',
    [UserRole.DTA]: 'Coordinate and execute data transfers',
    [UserRole.SME]: 'Technical review and digital signatures',
    [UserRole.MEDIA_CUSTODIAN]: 'Physical media management and disposition'
  };
  return roleDescriptions[role] || 'Role-specific access';
}

export async function getSystemSettings(): Promise<Record<string, string>> {
  const settingsList = await sql`SELECT key, value FROM system_settings` as Array<{ key: string; value: string }>;
  return settingsList.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);
}

export async function saveSystemSettings(settings: Record<string, string>): Promise<void> {
  await sql.begin(async (tx) => {
    for (const [key, value] of Object.entries(settings)) {
      await tx`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (${key}, ${value}, EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = EXCLUDED.updated_at
      `;
    }
  });
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export type User = {
  id: number;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  primary_role: UserRoleType;
  organization?: string;
  phone?: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: number;
  updated_at: number;
};

export type AFTRequest = {
  id: number;
  request_number: string;
  requestor_id: number;
  approver_id?: number;
  dta_id?: number;
  sme_id?: number;
  media_custodian_id?: number;
  tpi_required: boolean;
  status: AFTStatusType;
  requestor_name: string;
  requestor_org: string;
  requestor_phone: string;
  requestor_email: string;
  transfer_purpose: string;
  transfer_type: string;
  classification: string;
  caveat_info?: string;
  data_description: string;
  source_system?: string;
  source_location?: string;
  source_contact?: string;
  source_phone?: string;
  source_email?: string;
  dest_system?: string;
  dest_location?: string;
  dest_contact?: string;
  dest_phone?: string;
  dest_email?: string;
  data_format?: string;
  data_size?: string;
  transfer_method?: string;
  encryption?: string;
  compression_required?: boolean;
  files_list?: string;
  additional_file_list_attached: boolean;
  selected_drive_id?: number;
  requested_start_date?: number;
  requested_end_date?: number;
  urgency_level?: string;
  actual_start_date?: number;
  actual_end_date?: number;
  transfer_notes?: string;
  transfer_data?: string;
  verification_type?: string;
  verification_results?: string;
  approval_date?: number;
  approval_notes?: string;
  approval_data?: string;
  rejection_reason?: string;
  created_at: number;
  updated_at: number;
};

export type FileItem = {
  fileName: string;
  fileType: string;
  fileSize?: string;
  description?: string;
};

// Database migrations for approver functionality
import { getDb } from "./database-bun";

export function runApproverMigrations() {
  const db = getDb();
  
  try {
    // Add approver-specific columns to aft_requests if they don't exist
    const columns = db.query("PRAGMA table_info(aft_requests)").all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);
    
    // Add DTA Section 4 (Anti-Virus Scan) columns if missing
    if (!columnNames.includes('origination_scan_performed')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN origination_scan_performed BOOLEAN DEFAULT 0");
      console.log("✓ Added origination_scan_performed column to aft_requests");
    }
    if (!columnNames.includes('origination_files_scanned')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN origination_files_scanned INTEGER");
      console.log("✓ Added origination_files_scanned column to aft_requests");
    }
    if (!columnNames.includes('origination_threats_found')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN origination_threats_found INTEGER DEFAULT 0");
      console.log("✓ Added origination_threats_found column to aft_requests");
    }
    if (!columnNames.includes('destination_scan_performed')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN destination_scan_performed BOOLEAN DEFAULT 0");
      console.log("✓ Added destination_scan_performed column to aft_requests");
    }
    if (!columnNames.includes('destination_files_scanned')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN destination_files_scanned INTEGER");
      console.log("✓ Added destination_files_scanned column to aft_requests");
    }
    if (!columnNames.includes('destination_threats_found')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN destination_threats_found INTEGER DEFAULT 0");
      console.log("✓ Added destination_threats_found column to aft_requests");
    }
    
    // Add scan status fields for clean/infected results
    if (!columnNames.includes('origination_scan_status')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN origination_scan_status TEXT DEFAULT 'pending'");
      console.log("✓ Added origination_scan_status column to aft_requests");
    }
    if (!columnNames.includes('destination_scan_status')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN destination_scan_status TEXT DEFAULT 'pending'");
      console.log("✓ Added destination_scan_status column to aft_requests");
    }
    
    // Add transfer completion fields if missing
    if (!columnNames.includes('transfer_completed_date')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN transfer_completed_date INTEGER");
      console.log("✓ Added transfer_completed_date column to aft_requests");
    }
    if (!columnNames.includes('files_transferred_count')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN files_transferred_count INTEGER");
      console.log("✓ Added files_transferred_count column to aft_requests");
    }
    if (!columnNames.includes('dta_signature_date')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN dta_signature_date INTEGER");
      console.log("✓ Added dta_signature_date column to aft_requests");
    }
    if (!columnNames.includes('sme_signature_date')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN sme_signature_date INTEGER");
      console.log("✓ Added sme_signature_date column to aft_requests");
    }
    if (!columnNames.includes('assigned_sme_id')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN assigned_sme_id INTEGER REFERENCES users(id)");
      console.log("✓ Added assigned_sme_id column to aft_requests");
    }
    if (!columnNames.includes('tpi_maintained')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN tpi_maintained BOOLEAN DEFAULT 0");
      console.log("✓ Added tpi_maintained column to aft_requests");
    }
    
    // Add approver_email column if missing
    if (!columnNames.includes('approver_email')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN approver_email TEXT");
      console.log("✓ Added approver_email column to aft_requests");
    }
    
    // Add priority column if missing
    if (!columnNames.includes('priority')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN priority TEXT DEFAULT 'normal'");
      console.log("✓ Added priority column to aft_requests");
    }
    
    // Add file-related columns if missing
    if (!columnNames.includes('file_name')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN file_name TEXT");
      console.log("✓ Added file_name column to aft_requests");
    }
    
    if (!columnNames.includes('file_size')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN file_size TEXT");
      console.log("✓ Added file_size column to aft_requests");
    }
    
    if (!columnNames.includes('file_type')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN file_type TEXT");
      console.log("✓ Added file_type column to aft_requests");
    }
    
    if (!columnNames.includes('file_hash')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN file_hash TEXT");
      console.log("✓ Added file_hash column to aft_requests");
    }
    
    if (!columnNames.includes('justification')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN justification TEXT");
      console.log("✓ Added justification column to aft_requests");
    }
    
    if (!columnNames.includes('description')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN description TEXT");
      console.log("✓ Added description column to aft_requests");
    }
    
    // Create aft_request_history table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS aft_request_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL REFERENCES aft_requests(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        user_email TEXT NOT NULL,
        notes TEXT,
        old_value TEXT,
        new_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Created/verified aft_request_history table");
    
    // Create index on request_id for better performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_aft_request_history_request_id 
      ON aft_request_history(request_id)
    `);
    
    // Don't modify existing statuses - let the application handle them
    
    console.log("✓ Approver migrations completed successfully");
    
  } catch (error) {
    console.error("Error running approver migrations:", error);
    throw error;
  }
}

// NOTE: runApproverMigrations() used to be invoked here at module load,
// which created an ordering hazard with database-bun.ts (the migrations ran
// before the base CREATE TABLE statements completed on a fresh database).
// The migrations are now invoked explicitly by database-bun.ts /
// runStartupMigrations() once the schema has been created.
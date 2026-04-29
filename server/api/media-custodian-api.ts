// Media Custodian API endpoints
import { getDb, type DbRow } from '../../lib/database-bun';
import { RequestTrackingService } from '../../lib/request-tracking';

// Get all users for assignment dropdowns
async function getAllUsers(): Promise<any[]> {
  const db = getDb();
  return (await db
    .query(`
    SELECT id, email, first_name, last_name, primary_role
    FROM users
    WHERE is_active = TRUE
    ORDER BY last_name, first_name
  `)
    .all()) as DbRow[];
}

// Get only DTAs for drive assignment
async function getDTAUsers(): Promise<any[]> {
  const db = getDb();
  return (await db
    .query(`
    SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
    WHERE u.is_active = TRUE AND ur.role = 'dta'
    ORDER BY u.last_name, u.first_name
  `)
    .all()) as DbRow[];
}

// Media Drive CRUD Operations
async function getAllMediaDrives(): Promise<any[]> {
  const db = getDb();
  return (await db
    .query(`
    SELECT md.*, u.email as issued_to_email, u.first_name, u.last_name
    FROM media_drives md
    LEFT JOIN users u ON md.issued_to_user_id = u.id
    ORDER BY md.created_at DESC
  `)
    .all()) as DbRow[];
}

async function getMediaDriveById(id: number): Promise<any | null> {
  const db = getDb();
  const row = (await db
    .query(`
    SELECT md.*, u.email as issued_to_email, u.first_name, u.last_name
    FROM media_drives md
    LEFT JOIN users u ON md.issued_to_user_id = u.id
    WHERE md.id = ?
  `)
    .get(id)) as DbRow | undefined;
  return row || null;
}

async function createMediaDrive(driveData: any): Promise<any> {
  const db = getDb();
  const result = await db
    .query(`
    INSERT INTO media_drives (serial_number, media_control_number, type, model, capacity, location, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      driveData.serial_number,
      driveData.media_control_number || null,
      driveData.type,
      driveData.model,
      driveData.capacity,
      driveData.location || '',
      driveData.status || 'available',
    );

  return { id: result.lastInsertRowid, ...driveData };
}

async function updateMediaDrive(id: number, driveData: any): Promise<boolean> {
  const db = getDb();
  const fields = [];
  const values = [];

  if (driveData.serial_number !== undefined) {
    fields.push('serial_number = ?');
    values.push(driveData.serial_number);
  }
  if (driveData.media_control_number !== undefined) {
    fields.push('media_control_number = ?');
    values.push(driveData.media_control_number);
  }
  if (driveData.type !== undefined) {
    fields.push('type = ?');
    values.push(driveData.type);
  }
  if (driveData.model !== undefined) {
    fields.push('model = ?');
    values.push(driveData.model);
  }
  if (driveData.capacity !== undefined) {
    fields.push('capacity = ?');
    values.push(driveData.capacity);
  }
  if (driveData.location !== undefined) {
    fields.push('location = ?');
    values.push(driveData.location);
  }
  if (driveData.status !== undefined) {
    fields.push('status = ?');
    values.push(driveData.status);
  }

  fields.push('updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT');
  values.push(id);

  const result = await db
    .query(`
    UPDATE media_drives 
    SET ${fields.join(', ')}
    WHERE id = ?
  `)
    .run(...values);

  return result.changes > 0;
}

async function deleteMediaDrive(id: number): Promise<boolean> {
  const db = getDb();
  const result = await db.query('DELETE FROM media_drives WHERE id = ?').run(id);
  return result.changes > 0;
}

async function issueDrive(
  driveId: number,
  userId: number,
  purpose: string,
): Promise<{ success: boolean; message: string }> {
  const db = getDb();

  // 1. Check if user is a DTA
  const user = (await db
    .query(`
    SELECT u.id, u.email, ur.role
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
    WHERE u.id = ? AND ur.role = 'dta'
  `)
    .get(userId)) as DbRow;

  if (!user) {
    return { success: false, message: 'Only DTAs can have drives issued to them' };
  }

  // 2. Check if DTA already has a drive issued
  const existingDrive = (await db
    .query(`
    SELECT id, media_control_number, type
    FROM media_drives
    WHERE issued_to_user_id = ? AND status = 'issued'
  `)
    .get(userId)) as DbRow;

  if (existingDrive) {
    return {
      success: false,
      message: `DTA already has drive ${existingDrive.media_control_number} (${existingDrive.type}) issued. DTAs can only have one drive at a time.`,
    };
  }

  // 3. Issue the drive
  const result = await db
    .query(`
    UPDATE media_drives 
    SET issued_to_user_id = ?, issued_at = EXTRACT(EPOCH FROM NOW())::BIGINT, purpose = ?, status = 'issued', last_used = EXTRACT(EPOCH FROM NOW())::BIGINT, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = ? AND status = 'available'
  `)
    .run(userId, purpose, driveId);

  if (result.changes > 0) {
    return { success: true, message: 'Drive issued successfully' };
  } else {
    return { success: false, message: 'Drive not available or not found' };
  }
}

async function returnDrive(driveId: number): Promise<{ success: boolean; message: string }> {
  const db = getDb();

  // Check if drive has any active AFT requests
  const activeRequest = (await db
    .query(`
    SELECT ar.id, ar.status, ar.request_number
    FROM aft_requests ar 
    WHERE ar.selected_drive_id = ? 
    AND ar.status NOT IN ('completed', 'disposed', 'rejected', 'cancelled')
    LIMIT 1
  `)
    .get(driveId)) as DbRow;

  if (activeRequest) {
    return {
      success: false,
      message: `Cannot return drive. Associated with active AFT request ${activeRequest.request_number} (${activeRequest.status})`,
    };
  }

  const result = await db
    .query(`
    UPDATE media_drives 
    SET issued_to_user_id = NULL, returned_at = EXTRACT(EPOCH FROM NOW())::BIGINT, status = 'available', last_used = EXTRACT(EPOCH FROM NOW())::BIGINT, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = ?
  `)
    .run(driveId);

  return {
    success: result.changes > 0,
    message: result.changes > 0 ? 'Drive returned successfully' : 'Failed to return drive',
  };
}

// Get media inventory (alias for getAllMediaDrives for inventory page)
async function getMediaInventory(): Promise<any[]> {
  return getAllMediaDrives();
}

// Get all requests with filtering support
async function getAllRequests(query: any = {}): Promise<any[]> {
  const db = getDb();

  let sql = `
    SELECT ar.*, 
           u.first_name || ' ' || u.last_name as requestor_name,
           u.email as requestor_email
    FROM aft_requests ar
    LEFT JOIN users u ON ar.requestor_id = u.id
  `;

  const conditions = [];
  const params = [];

  // Add filtering conditions based on query parameters
  if (query.status) {
    conditions.push('ar.status = ?');
    params.push(query.status);
  }

  if (query.requestor_id) {
    conditions.push('ar.requestor_id = ?');
    params.push(query.requestor_id);
  }

  if (query.classification) {
    conditions.push('ar.classification = ?');
    params.push(query.classification);
  }

  if (query.transfer_type) {
    conditions.push('ar.transfer_type = ?');
    params.push(query.transfer_type);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' ORDER BY ar.created_at DESC';

  // Add limit if specified
  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(query.limit, 10));
  }

  return (await db.query(sql).all(...params)) as DbRow[];
}

// Get request statistics for reports page
async function getRequestStats(): Promise<any> {
  const db = getDb();

  // Get total requests count
  const totalResult = (await db.query('SELECT COUNT(*) as count FROM aft_requests').get()) as DbRow;
  const total = totalResult?.count || 0;

  // Get pending requests count
  const pendingResult = (await db
    .query(
      "SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')",
    )
    .get()) as DbRow;
  const pending = pendingResult?.count || 0;

  // Get completed requests count
  const completedResult = (await db
    .query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'completed'")
    .get()) as DbRow;
  const completed = completedResult?.count || 0;

  // Get recent activity (last 30 days)
  const recentResult = (await db
    .query(
      'SELECT COUNT(*) as count FROM aft_requests WHERE created_at >= EXTRACT(EPOCH FROM NOW())::BIGINT - 2592000',
    )
    .get()) as DbRow;
  const recentActivity = recentResult?.count || 0;

  return {
    total,
    pending,
    completed,
    recentActivity,
  };
}

// Generate reports based on type and parameters
async function generateReport(type: string, params?: any): Promise<any> {
  const _db = getDb();

  try {
    switch (type.toLowerCase()) {
      case 'media_inventory':
        return await generateMediaInventoryReport(params);

      case 'request_summary':
        return await generateRequestSummaryReport(params);

      case 'drive_utilization':
        return await generateDriveUtilizationReport(params);

      case 'user_activity':
        return await generateUserActivityReport(params);

      default:
        throw new Error(`Unknown report type: ${type}`);
    }
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}

// Generate media inventory report
async function generateMediaInventoryReport(_params?: any): Promise<any> {
  const db = getDb();

  // Get drive counts by status
  const statusCounts = (await db
    .query(`
    SELECT status, COUNT(*) as count
    FROM media_drives
    GROUP BY status
  `)
    .all()) as DbRow[];

  // Get drive counts by type
  const typeCounts = (await db
    .query(`
    SELECT type, COUNT(*) as count
    FROM media_drives
    GROUP BY type
  `)
    .all()) as DbRow[];

  // Get recently issued drives
  const recentlyIssued = (await db
    .query(`
    SELECT md.*, u.email, u.first_name, u.last_name
    FROM media_drives md
    LEFT JOIN users u ON md.issued_to_user_id = u.id
    WHERE md.issued_at >= EXTRACT(EPOCH FROM NOW())::BIGINT - 604800
    ORDER BY md.issued_at DESC
    LIMIT 10
  `)
    .all()) as DbRow[];

  return {
    title: 'Media Inventory Report',
    generated_at: new Date().toISOString(),
    summary: {
      total_drives: statusCounts.reduce((sum, item) => sum + item.count, 0),
      by_status: statusCounts,
      by_type: typeCounts,
    },
    recently_issued: recentlyIssued,
  };
}

// Generate request summary report
async function generateRequestSummaryReport(_params?: any): Promise<any> {
  const db = getDb();

  // Get request counts by status
  const statusCounts = (await db
    .query(`
    SELECT status, COUNT(*) as count
    FROM aft_requests
    GROUP BY status
  `)
    .all()) as DbRow[];

  // Get recent requests
  const recentRequests = (await db
    .query(`
    SELECT ar.*, u.first_name || ' ' || u.last_name as requestor_name
    FROM aft_requests ar
    LEFT JOIN users u ON ar.requestor_id = u.id
    ORDER BY ar.created_at DESC
    LIMIT 10
  `)
    .all()) as DbRow[];

  // Get monthly request trends (last 6 months)
  const monthlyTrends = (await db
    .query(`
    SELECT
      to_char(to_timestamp(created_at), 'YYYY-MM') as month,
      COUNT(*) as count
    FROM aft_requests
    WHERE created_at >= EXTRACT(EPOCH FROM NOW())::BIGINT - 15552000
    GROUP BY month
    ORDER BY month DESC
  `)
    .all()) as DbRow[];

  return {
    title: 'Request Summary Report',
    generated_at: new Date().toISOString(),
    summary: {
      total_requests: statusCounts.reduce((sum, item) => sum + item.count, 0),
      by_status: statusCounts,
      monthly_trends: monthlyTrends,
    },
    recent_requests: recentRequests,
  };
}

// Generate drive utilization report
async function generateDriveUtilizationReport(_params?: any): Promise<any> {
  const db = getDb();

  // Get utilization statistics
  const utilization = (await db
    .query(`
    SELECT 
      COUNT(*) as total_drives,
      SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) as issued_drives,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_drives,
      SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_drives
    FROM media_drives
  `)
    .get()) as DbRow;

  // Get top users by drive usage
  const topUsers = (await db
    .query(`
    SELECT 
      u.first_name || ' ' || u.last_name as user_name,
      u.email,
      COUNT(*) as drives_issued
    FROM media_drives md
    JOIN users u ON md.issued_to_user_id = u.id
    WHERE md.status = 'issued'
    GROUP BY u.id
    ORDER BY drives_issued DESC
    LIMIT 10
  `)
    .all()) as DbRow[];

  const utilizationRate =
    utilization.total_drives > 0
      ? ((utilization.issued_drives / utilization.total_drives) * 100).toFixed(1)
      : '0.0';

  return {
    title: 'Drive Utilization Report',
    generated_at: new Date().toISOString(),
    summary: {
      ...utilization,
      utilization_rate: `${utilizationRate}%`,
    },
    top_users: topUsers,
  };
}

// Generate user activity report
async function generateUserActivityReport(_params?: any): Promise<any> {
  const db = getDb();

  // Get user request activity
  const userActivity = (await db
    .query(`
    SELECT
      u.first_name || ' ' || u.last_name as user_name,
      u.email,
      COUNT(ar.id) as total_requests,
      SUM(CASE WHEN ar.status = 'completed' THEN 1 ELSE 0 END) as completed_requests,
      MAX(ar.created_at) as last_request_date
    FROM users u
    LEFT JOIN aft_requests ar ON u.id = ar.requestor_id
    WHERE u.primary_role = 'requestor' AND u.is_active = TRUE
    GROUP BY u.id
    ORDER BY total_requests DESC
    LIMIT 20
  `)
    .all()) as DbRow[];

  return {
    title: 'User Activity Report',
    generated_at: new Date().toISOString(),
    user_activity: userActivity.map((user) => ({
      ...user,
      last_request_date: user.last_request_date
        ? new Date(user.last_request_date * 1000).toISOString().split('T')[0]
        : 'Never',
    })),
  };
}

// Process request actions (approve, reject, complete, etc.)
async function processRequest(
  requestId: number,
  action: string,
  userId: number,
  notes?: string,
  dispositionData?: any,
): Promise<{ success: boolean; message: string; newStatus?: string }> {
  const db = getDb();

  try {
    // Get current request
    const request = (await db
      .query('SELECT * FROM aft_requests WHERE id = ?')
      .get(requestId)) as DbRow;
    if (!request) {
      return { success: false, message: 'Request not found' };
    }

    let newStatus: string;
    let message: string;

    // Determine new status based on action
    switch (action.toLowerCase()) {
      case 'approve':
        if (request.status === 'pending_media_custodian') {
          newStatus = 'completed';
          message = 'Request approved and marked as completed';
        } else {
          return {
            success: false,
            message: 'Request is not in a state that can be approved by media custodian',
          };
        }
        break;

      case 'reject':
        newStatus = 'rejected';
        message = 'Request has been rejected';
        break;

      case 'complete':
        newStatus = 'completed';
        message = 'Request marked as completed';
        break;

      case 'dispose':
        if (request.status === 'completed' || request.status === 'pending_media_custodian') {
          newStatus = 'disposed';
          message = 'Media has been disposed';
        } else {
          return { success: false, message: 'Request must be completed before disposal' };
        }
        break;

      case 'dispose_and_return_drive':
        if (request.status === 'completed' || request.status === 'pending_media_custodian') {
          // First dispose the media
          newStatus = 'disposed';
          message = 'Media has been disposed and drive returned';

          // Return the drive if one is associated
          if (request.selected_drive_id) {
            const returnResult = await returnDrive(request.selected_drive_id);
            if (!returnResult.success) {
              return {
                success: false,
                message: `Disposition completed but failed to return drive: ${returnResult.message}`,
              };
            }
          }
        } else {
          return { success: false, message: 'Request must be completed before disposal' };
        }
        break;

      default:
        return { success: false, message: 'Invalid action specified' };
    }

    // Store disposition data if provided
    if (dispositionData && (action === 'dispose' || action === 'dispose_and_return_drive')) {
      const dispositionDate = dispositionData.dispositionDate
        ? Math.floor(new Date(dispositionData.dispositionDate).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      await db
        .query(`
        UPDATE aft_requests 
        SET disposition_optical_destroyed = ?,
            disposition_optical_retained = ?,
            disposition_ssd_sanitized = ?,
            disposition_custodian_name = ?,
            disposition_date = ?,
            disposition_signature = ?,
            disposition_notes = ?,
            disposition_completed_at = ?,
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `)
        .run(
          dispositionData.opticalDestroyed || 'na',
          dispositionData.opticalRetained || 'na',
          dispositionData.ssdSanitized || 'na',
          dispositionData.custodianName,
          dispositionDate,
          dispositionData.digitalSignature,
          dispositionData.notes || '',
          Math.floor(Date.now() / 1000),
          requestId,
        );
    }

    // Update request status using RequestTrackingService
    const success = await RequestTrackingService.updateRequestStatus(
      requestId,
      userId,
      newStatus as DbRow,
      notes,
    );

    if (success) {
      return {
        success: true,
        message,
        newStatus,
      };
    } else {
      return {
        success: false,
        message: 'Failed to update request status',
      };
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return {
      success: false,
      message: 'An error occurred while processing the request',
    };
  }
}

export const MediaCustodianAPI = {
  getAllUsers,
  getDTAUsers,
  getAllMediaDrives,
  getMediaDriveById,
  createMediaDrive,
  updateMediaDrive,
  deleteMediaDrive,
  issueDrive,
  returnDrive,
  getMediaInventory,
  getAllRequests,
  getRequestStats,
  generateReport,
  processRequest,
};

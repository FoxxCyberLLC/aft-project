// DTA API endpoints
import { UserRole, getDb } from "../../lib/database-bun";
import { RoleMiddleware } from "../../middleware/role-middleware";
import { RequestTrackingService } from "../../lib/request-tracking";
import { auditLog } from "../../lib/security";
import { CACSignatureManager, type CACSignatureData } from "../../lib/cac-signature";

export async function handleDTAAPI(request: Request, path: string, ipAddress: string): Promise<Response | null> {
  if (!path.startsWith('/api/dta/')) {
    return null;
  }

  // Check authentication and DTA role
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.DTA);
  if (authResult.response) return authResult.response;
  const csrfFail = RoleMiddleware.verifyCsrf(request, authResult.session);
  if (csrfFail) return csrfFail;

  const db = getDb();
  const userId = authResult.session.userId;
  const userEmail = authResult.session.email;

  // Parse the API path
  const apiPath = path.replace('/api/dta/', '');
  const segments = apiPath.split('/').filter(Boolean);

  try {
    switch (request.method) {
      case 'GET':
        return await handleDTAGet(segments, db, userId, userEmail, ipAddress, authResult.session);
      case 'POST':
        return await handleDTAPost(segments, request, db, userId, userEmail, ipAddress);
      case 'PUT':
        return await handleDTAPut(segments, request, db, userId, userEmail, ipAddress);
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('DTA API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleDTAGet(segments: string[], db: any, userId: number, userEmail: string, ipAddress: string, session?: any): Promise<Response> {
  const [resource, id, action] = segments;

  switch (resource) {
    case 'cac-info':
      return getCACInfo(session);

    case 'dashboard':
      return getDashboardData(db);
    
    case 'requests':
      if (id && action === 'timeline') {
        return getRequestTimeline(db, parseInt(id));
      } else if (id) {
        return getRequestDetails(db, parseInt(id), userId);
      } else {
        return getAllRequests(db, userId);
      }
    
    case 'transfers':
      if (id && action === 'status') {
        return getTransferStatus(db, parseInt(id));
      } else if (action === 'active') {
        return getActiveTransfers(db);
      } else {
        return getAllTransfers(db);
      }
    
    case 'statistics':
      return getDTAStatistics(db);
    
    case 'sme-users':
      return getSMEUsers(db);
    
    default:
      return new Response(JSON.stringify({ error: 'Resource not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
  }
}

async function handleDTAPost(segments: string[], request: Request, db: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const [resource, id, action] = segments;
  const body = await request.json().catch(() => ({}));

  switch (resource) {
    case 'requests':
      if (id && action === 'approve') {
        return await approveRequest(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'reject') {
        return await rejectRequest(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'activate') {
        return await activateTransfer(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'scan') {
        return await recordAntivirusScan(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'complete') {
        return await completeTransfer(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'sign') {
        return await signDTARequest(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'transfer-status') {
        return getTransferStatus(db, parseInt(id));
      } else if (id && action === 'antivirus-scan') {
        return await recordAntivirusScan(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'complete-transfer') {
        return await completeTransfer(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
    
    case 'transfers':
      if (id && action === 'pause') {
        return await pauseTransfer(db, parseInt(id), userId, userEmail, ipAddress);
      } else if (id && action === 'resume') {
        return await resumeTransfer(db, parseInt(id), userId, userEmail, ipAddress);
      } else if (id && action === 'cancel') {
        return await cancelTransfer(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
    
    case 'bulk':
      if (action === 'process') {
        return await bulkProcessRequests(db, body, userId, userEmail, ipAddress);
      }
      break;
    
    case 'transfer-form':
      return await handleTransferFormSubmission(db, body, userId, userEmail, ipAddress);
    
    case 'sign-transfer':
      if (id) {
        return await signTransferManual(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
    
    case 'sign-transfer-cac':
      if (id) {
        return await signTransferWithCAC(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
  }

  return new Response(JSON.stringify({ error: 'Action not supported' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleDTAPut(segments: string[], request: Request, db: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const [resource, id] = segments;
  const body = await request.json().catch(() => ({}));

  switch (resource) {
    case 'requests':
      if (id) {
        return updateRequest(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
    
    case 'transfers':
      if (id) {
        return updateTransferSettings(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
  }

  return new Response(JSON.stringify({ error: 'Update not supported' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

// GET endpoint implementations
async function getDashboardData(db: any): Promise<Response> {
  const stats = {
    totalRequests: await db.query("SELECT COUNT(*) as count FROM aft_requests").get(),
    pendingDTA: await db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'pending_dta'").get(),
    activeTransfers: await db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'active_transfer'").get(),
    completedToday: await db.query(`
      SELECT COUNT(*) as count FROM aft_requests
      WHERE status = 'completed' AND to_timestamp(updated_at)::date = CURRENT_DATE
    `).get()
  };

  return new Response(JSON.stringify({ success: true, stats }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getAllRequests(db: any, userId?: number): Promise<Response> {
  // For DTA, show assigned requests
  const requests = await db.query(`
    SELECT * FROM aft_requests 
    WHERE dta_id = ? 
    AND status IN ('pending_dta', 'active_transfer', 'pending_sme_signature', 'pending_media_custodian', 'completed')
    ORDER BY 
      CASE 
        WHEN status = 'pending_dta' THEN 1
        WHEN status = 'active_transfer' THEN 2
        ELSE 3
      END,
      updated_at DESC
    LIMIT 100
  `).all(userId) as any[];

  return new Response(JSON.stringify({ success: true, requests }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getRequestDetails(db: any, requestId: number, userId?: number): Promise<Response> {
  // DTA can only access details of their assigned requests
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found or not assigned to you' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true, request }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getRequestTimeline(db: any, requestId: number): Promise<Response> {
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const timeline = RequestTrackingService.getRequestTimeline(requestId);
  return new Response(JSON.stringify({ success: true, request, timeline }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getActiveTransfers(db: any): Promise<Response> {
  const transfers = await db.query(`
    SELECT * FROM aft_requests 
    WHERE status = 'active_transfer' 
    ORDER BY updated_at DESC
  `).all();

  return new Response(JSON.stringify({ success: true, transfers }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getAllTransfers(db: any): Promise<Response> {
  const transfers = await db.query(`
    SELECT * FROM aft_requests 
    WHERE status IN ('active_transfer', 'completed', 'cancelled') 
    ORDER BY updated_at DESC 
    LIMIT 50
  `).all();

  return new Response(JSON.stringify({ success: true, transfers }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getTransferStatus(db: any, requestId: number): Promise<Response> {
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);

  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const transferStatus = {
    origination_scan_performed: !!request.origination_scan_performed,
    destination_scan_performed: !!request.destination_scan_performed,
    origination_threats_found: request.origination_threats_found || 0,
    destination_threats_found: request.destination_threats_found || 0,
    transfer_completed: !!request.transfer_completed_date,
    dta_signature: !!request.dta_signature_date,
    files_transferred: request.files_transferred_count || 0,
    tpi_maintained: !!request.tpi_maintained
  };

  return new Response(JSON.stringify({ 
    success: true, 
    request, 
    transferStatus 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getDTAStatistics(db: any): Promise<Response> {
  const stats = {
    totalProcessed: await db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('draft', 'submitted')").get(),
    averageProcessingTime: "2.4 hours", // This would be calculated from actual data
    dataVolume: "1.2 TB", // This would be calculated from actual data
    successRate: "98.5%", // This would be calculated from actual data
    weeklyTrends: [
      { day: 'Mon', processed: 15 },
      { day: 'Tue', processed: 23 },
      { day: 'Wed', processed: 18 },
      { day: 'Thu', processed: 31 },
      { day: 'Fri', processed: 27 },
      { day: 'Sat', processed: 12 },
      { day: 'Sun', processed: 8 }
    ]
  };

  return new Response(JSON.stringify({ success: true, stats }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getSMEUsers(db: any): Promise<Response> {
  // Get all users with SME role
  const smeUsers = await db.query(`
    SELECT 
      id, 
      email, 
      first_name || ' ' || last_name as name,
      organization
    FROM users 
    WHERE primary_role = 'sme' OR 'sme' IN (
      SELECT role FROM user_roles WHERE user_id = users.id
    )
    ORDER BY name
  `).all() as any[];

  return new Response(JSON.stringify({ 
    success: true, 
    users: smeUsers 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// POST endpoint implementations
async function approveRequest(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // Only allow assigned DTA to approve the request
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found or not assigned to you' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'pending_dta') {
    return new Response(JSON.stringify({ error: 'Request is not pending DTA approval' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request status to active_transfer and assign DTA
  await db.query(`
    UPDATE aft_requests 
    SET status = ?, dta_id = ?, actual_start_date = EXTRACT(EPOCH FROM NOW())::BIGINT, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT 
    WHERE id = ?
  `).run('active_transfer', userId, requestId);

  // Log the approval
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'dta_approved',
    undefined,
    'active_transfer',
    JSON.stringify({ action: 'dta_approved' }),
    `Request approved by ${userEmail} and moved to active transfer`
  );

  // Security audit log
  await auditLog(userId, 'DTA_APPROVAL', `DTA approved request #${requestId}`, ipAddress, { 
    requestId, 
    action: 'approve',
    notes: body.notes || 'No additional notes' 
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Request approved and moved to active transfer status',
    newStatus: 'active_transfer'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function rejectRequest(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // Only allow assigned DTA to reject the request
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'pending_dta') {
    return new Response(JSON.stringify({ error: 'Request is not pending DTA approval' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!body.reason) {
    return new Response(JSON.stringify({ error: 'Rejection reason is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request status
  await db.query("UPDATE aft_requests SET status = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = ?").run('rejected', requestId);

  // Log the rejection
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'dta_rejected',
    undefined,
    'rejected',
    JSON.stringify({ action: 'dta_rejected', reason: body.reason }),
    `Request rejected by ${userEmail}: ${body.reason}`
  );

  // Security audit log
  await auditLog(userId, 'DTA_REJECTION', `DTA rejected request #${requestId}`, ipAddress, { 
    requestId, 
    action: 'reject', 
    reason: body.reason 
  });

  return new Response(JSON.stringify({ success: true, message: 'Request rejected successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function pauseTransfer(db: any, requestId: number, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // Only allow assigned DTA to pause the transfer
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'active_transfer') {
    return new Response(JSON.stringify({ error: 'Transfer is not active' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // In a real implementation, this would pause the actual transfer process
  // For now, we'll just log the action
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'transfer_paused',
    'active_transfer',
    'active_transfer',
    JSON.stringify({ action: 'transfer_paused' }),
    `Transfer paused by ${userEmail}`
  );

  // Security audit log
  await auditLog(userId, 'TRANSFER_PAUSE', `Paused transfer for request #${requestId}`, ipAddress, { requestId });

  return new Response(JSON.stringify({ success: true, message: 'Transfer paused successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function resumeTransfer(db: any, requestId: number, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // Only allow assigned DTA to resume the transfer
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Resume transfer logic would go here
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'transfer_resumed',
    'active_transfer',
    'active_transfer',
    JSON.stringify({ action: 'transfer_resumed' }),
    `Transfer resumed by ${userEmail}`
  );

  // Security audit log
  await auditLog(userId, 'TRANSFER_RESUME', `Resumed transfer for request #${requestId}`, ipAddress, { requestId });

  return new Response(JSON.stringify({ success: true, message: 'Transfer resumed successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function cancelTransfer(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // Only allow assigned DTA to cancel the transfer
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request status
  await db.query("UPDATE aft_requests SET status = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = ?").run('cancelled', requestId);

  // Log the cancellation
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'transfer_cancelled',
    'cancelled',
    'cancelled',
    JSON.stringify({ action: 'transfer_cancelled', reason: body.reason || 'No reason provided' }),
    `Transfer cancelled by ${userEmail}: ${body.reason || 'No reason provided'}`
  );

  // Security audit log
  await auditLog(userId, 'TRANSFER_CANCEL', `Cancelled transfer for request #${requestId}`, ipAddress, { 
    requestId, 
    reason: body.reason || 'No reason provided' 
  });

  return new Response(JSON.stringify({ success: true, message: 'Transfer cancelled successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function bulkProcessRequests(db: any, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const { action, requestIds, reason } = body;
  
  if (!action || !requestIds || !Array.isArray(requestIds)) {
    return new Response(JSON.stringify({ error: 'Invalid bulk request data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const results = [];
  const errors = [];

  for (const requestId of requestIds) {
    try {
      const request = await db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
      if (!request) {
        errors.push(`Request ${requestId} not found`);
        continue;
      }

      if (action === 'approve' && request.status === 'pending_dta') {
        await db.query("UPDATE aft_requests SET status = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = ?").run('active_transfer', requestId);
        RequestTrackingService.addAuditEntry(
          requestId,
          userId,
          'dta_approved',
          'active_transfer',
          'active_transfer',
          JSON.stringify({ action: 'dta_approved' }),
          `Bulk approved by ${userEmail}`
        );
        results.push({ requestId, status: 'approved' });
      } else if (action === 'reject' && request.status === 'pending_dta') {
        await db.query("UPDATE aft_requests SET status = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = ?").run('rejected', requestId);
        RequestTrackingService.addAuditEntry(
          requestId,
          userId,
          'dta_rejected',
          'rejected',
          'rejected',
          JSON.stringify({ action: 'dta_rejected', reason: reason }),
          `Bulk rejected by ${userEmail}: ${reason}`
        );
        results.push({ requestId, status: 'rejected' });
      } else {
        errors.push(`Request ${requestId} cannot be ${action}d in current status`);
      }
    } catch (error) {
      errors.push(`Error processing request ${requestId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Security audit log
  await auditLog(userId, 'BULK_PROCESS', `Bulk ${body.action} for ${body.requestIds.length} requests`, ipAddress, { 
    action, 
    requestCount: requestIds.length,
    successCount: results.length,
    errorCount: errors.length 
  });

  return new Response(JSON.stringify({ 
    success: true, 
    processed: results.length,
    errorCount: errors.length,
    results,
    errors 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function updateRequest(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update allowed fields
  const allowedFields = ['priority', 'notes', 'transfer_window'];
  const updates = [];
  const values = [];

  for (const [field, value] of Object.entries(body)) {
    if (allowedFields.includes(field)) {
      updates.push(`${field} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  values.push(Date.now() / 1000); // updated_at
  values.push(requestId);

  await db.query(`UPDATE aft_requests SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...values);

  // Log the update
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'dta_updated',
    'active_transfer',
    'active_transfer',
    JSON.stringify({ action: 'dta_updated' }),
    `Request updated by ${userEmail}`
  );

  return new Response(JSON.stringify({ success: true, message: 'Request updated successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function updateTransferSettings(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // This would update transfer-specific settings like bandwidth limits, retry counts, etc.
  return new Response(JSON.stringify({ success: true, message: 'Transfer settings updated' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Section 4 AFT Form Functions - Anti-Virus Scan and Transfer Process

async function recordAntivirusScan(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'active_transfer') {
    return new Response(JSON.stringify({ error: 'Request is not in active transfer status' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { scanType, result, notes, filesScanned, threatsFound } = body;
  
  if (!scanType || !['origination', 'destination'].includes(scanType)) {
    return new Response(JSON.stringify({ error: 'Invalid scan type. Must be "origination" or "destination"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!result || !['clean', 'infected'].includes(result)) {
    return new Response(JSON.stringify({ error: 'Invalid scan result. Must be "clean" or "infected"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update the appropriate scan fields based on scan type
  if (scanType === 'origination') {
    await db.query(`
      UPDATE aft_requests 
      SET origination_scan_performed = TRUE, 
          origination_scan_status = ?,
          origination_files_scanned = ?, 
          origination_threats_found = ?,
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = ?
    `).run(result, filesScanned || 0, result === 'infected' ? (threatsFound || 1) : 0, requestId);
    
    RequestTrackingService.addAuditEntry(
      requestId,
      userId,
      'origination_scan',
      undefined,
      'active_transfer',
      JSON.stringify({ scanType, result, filesScanned: filesScanned || 0, threatsFound: result === 'infected' ? (threatsFound || 1) : 0 }),
      `Origination media scan: ${result.toUpperCase()}. ${notes || 'No additional notes'}`
    );
  } else {
    await db.query(`
      UPDATE aft_requests 
      SET destination_scan_performed = TRUE, 
          destination_scan_status = ?,
          destination_files_scanned = ?, 
          destination_threats_found = ?,
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = ?
    `).run(result, filesScanned || 0, result === 'infected' ? (threatsFound || 1) : 0, requestId);
    
    RequestTrackingService.addAuditEntry(
      requestId,
      userId,
      'destination_scan',
      undefined,
      'active_transfer',
      JSON.stringify({ scanType, result, filesScanned: filesScanned || 0, threatsFound: result === 'infected' ? (threatsFound || 1) : 0 }),
      `Destination media scan: ${result.toUpperCase()}. ${notes || 'No additional notes'}`
    );
  }

  // Security audit log
  await auditLog(
    userId,
    'ANTIVIRUS_SCAN',
    `Recorded ${scanType} scan: ${result}${filesScanned ? ` (${filesScanned} files)` : ''}`,
    ipAddress,
    { 
      requestId, 
      scanType,
      result,
      filesScanned: filesScanned || 0
    }
  );

  return new Response(JSON.stringify({ 
    success: true, 
    message: `${scanType} scan recorded successfully`,
    scanType,
    filesScanned: filesScanned || 0,
    threatsFound: threatsFound || 0
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function activateTransfer(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // Only allow assigned DTA to activate the transfer
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  console.log(`[DEBUG] DTA Activation - Request ${requestId}, User ${userId}`);
  console.log(`[DEBUG] Request found:`, request ? 'YES' : 'NO');
  if (request) {
    console.log(`[DEBUG] Request status: ${request.status}, Expected: pending_dta`);
    console.log(`[DEBUG] Request DTA ID: ${request.dta_id}, User ID: ${userId}`);
  }
  
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found or not assigned to you' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Allow both 'pending_dta' and 'approved' status (for backward compatibility)
  if (request.status !== 'pending_dta' && request.status !== 'approved') {
    return new Response(JSON.stringify({ 
      error: `Request is not ready for DTA activation. Current status: ${request.status}` 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request status to active_transfer
  await db.query(`
    UPDATE aft_requests 
    SET status = 'active_transfer', 
        actual_start_date = EXTRACT(EPOCH FROM NOW())::BIGINT, 
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT 
    WHERE id = ?
  `).run(requestId);

  // Log the activation
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'transfer_activated',
    undefined,
    'active_transfer',
    JSON.stringify({ action: 'transfer_activated' }),
    `Transfer activated by DTA ${userEmail}. Section 4 procedures now in effect.`
  );

  // Security audit log
  await auditLog(
    userId,
    'TRANSFER_ACTIVATED',
    `Activated transfer for request #${requestId}`,
    ipAddress,
    { requestId }
  );

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Transfer activated successfully. Request moved to active transfer status.',
    newStatus: 'active_transfer'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function signDTARequest(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // Only allow assigned DTA to sign the request
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found or not assigned to you' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'active_transfer') {
    return new Response(JSON.stringify({ error: 'Request must be in active transfer status to sign' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Require that both AV scans are recorded before allowing signature
  if (!request.origination_scan_performed || !request.destination_scan_performed) {
    return new Response(JSON.stringify({ error: 'Both origination and destination AV scans must be recorded before DTA signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Extract SME assignment from body
  const { smeUserId, notes } = body;
  
  if (!smeUserId) {
    return new Response(JSON.stringify({ error: 'SME user must be assigned when signing' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Verify SME user exists and has SME role
  const smeUser = await db.query(`
    SELECT id, email, first_name || ' ' || last_name as name 
    FROM users 
    WHERE id = ? AND (primary_role = 'sme' OR id IN (
      SELECT user_id FROM user_roles WHERE role = 'sme'
    ))
  `).get(smeUserId);
  
  if (!smeUser) {
    return new Response(JSON.stringify({ error: 'Invalid SME user selected' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Update request with DTA signature, SME assignment, and move to SME signature
  await db.query(`
    UPDATE aft_requests 
    SET dta_signature_date = EXTRACT(EPOCH FROM NOW())::BIGINT,
        sme_id = ?,
        assigned_sme_id = ?,
        status = 'pending_sme_signature',
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = ?
  `).run(smeUserId, smeUserId, requestId);

  // Log the signature and SME assignment
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'dta_signed',
    'active_transfer',
    'pending_sme_signature',
    JSON.stringify({ smeUserId, smeName: smeUser.name }),
    `Request signed by DTA ${userEmail}. Assigned to SME ${smeUser.name} for Two-Person Integrity signature. ${notes || ''}`
  );

  // Security audit log
  await auditLog(
    userId,
    'DTA_SIGNATURE',
    `Signed request #${requestId} as DTA`,
    ipAddress,
    { requestId, smeUserId }
  );

  return new Response(JSON.stringify({ 
    success: true, 
    message: `DTA signature recorded successfully. Request assigned to ${smeUser.name} for Two-Person Integrity verification.`,
    newStatus: 'pending_sme_signature',
    assignedSME: {
      id: smeUser.id,
      name: smeUser.name,
      email: smeUser.email
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleTransferFormSubmission(db: any, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const { requestId, saveOnly, ...formData } = body;
  
  if (!requestId) {
    return new Response(JSON.stringify({ error: 'Request ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify request exists and is assigned to this DTA
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found or not assigned to you' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'active_transfer') {
    return new Response(JSON.stringify({ error: 'Request must be in active transfer status' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    let transferCompletedPerformed = false;
    let dtaSignedPerformed = false;
    // Handle AV scan updates
    if (formData.originationScanResult || formData.destinationScanResult) {
      if (formData.originationScanResult && formData.originationFilesScanned) {
        await db.query(`
          UPDATE aft_requests 
          SET origination_scan_performed = TRUE,
              origination_scan_status = ?, 
              origination_files_scanned = ?, 
              updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
          WHERE id = ?
        `).run(formData.originationScanResult, parseInt(formData.originationFilesScanned), requestId);
        
        RequestTrackingService.addAuditEntry(
          requestId,
          userId,
          'origination_scan_updated',
          undefined,
          'active_transfer',
          JSON.stringify({ result: formData.originationScanResult, filesScanned: formData.originationFilesScanned }),
          `Origination scan updated: ${formData.originationScanResult} (${formData.originationFilesScanned} files)`
        );
      }

      if (formData.destinationScanResult && formData.destinationFilesScanned) {
        await db.query(`
          UPDATE aft_requests 
          SET destination_scan_performed = TRUE,
              destination_scan_status = ?, 
              destination_files_scanned = ?, 
              updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
          WHERE id = ?
        `).run(formData.destinationScanResult, parseInt(formData.destinationFilesScanned), requestId);
        
        RequestTrackingService.addAuditEntry(
          requestId,
          userId,
          'destination_scan_updated',
          undefined,
          'active_transfer',
          JSON.stringify({ result: formData.destinationScanResult, filesScanned: formData.destinationFilesScanned }),
          `Destination scan updated: ${formData.destinationScanResult} (${formData.destinationFilesScanned} files)`
        );
      }
    }

    // Handle transfer completion
    if (formData.filesTransferred && !saveOnly) {
      // Re-fetch the request after potential scan updates to ensure we have the latest flags
      const latestRequest = await db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
      const canTransfer = !!latestRequest.origination_scan_performed && !!latestRequest.destination_scan_performed;
      if (!canTransfer) {
        return new Response(JSON.stringify({ error: 'Both scans must be recorded before completing transfer' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const transferDateTime = formData.transferDateTime ? new Date(formData.transferDateTime).getTime() / 1000 : Math.floor(Date.now() / 1000);
      
      await db.query(`
        UPDATE aft_requests 
        SET transfer_completed_date = ?, 
            files_transferred_count = ?, 
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `).run(transferDateTime, parseInt(formData.filesTransferred), requestId);
      
      RequestTrackingService.addAuditEntry(
        requestId,
        userId,
        'transfer_completed',
        undefined,
        'active_transfer',
        JSON.stringify({ filesTransferred: formData.filesTransferred, notes: formData.transferNotes }),
        `Transfer completed: ${formData.filesTransferred} files transferred. ${formData.transferNotes || ''}`
      );
      transferCompletedPerformed = true;
    }

    // Handle DTA signature and SME assignment - allow if transfer is completed
    if (formData.smeUserId && formData.dtaSignatureDateTime && !saveOnly) {
      // Re-check request to get latest scan flags after potential updates
      const updatedRequest = await db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
      if (!updatedRequest.origination_scan_performed || !updatedRequest.destination_scan_performed) {
        return new Response(JSON.stringify({ error: 'Both origination and destination AV scans must be recorded before DTA signature' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify SME user
      const smeUser = await db.query(`
        SELECT id, email, first_name || ' ' || last_name as name 
        FROM users 
        WHERE id = ? AND (primary_role = 'sme' OR id IN (
          SELECT user_id FROM user_roles WHERE role = 'sme'
        ))
      `).get(formData.smeUserId);
      
      if (!smeUser) {
        return new Response(JSON.stringify({ error: 'Invalid SME user selected' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const signatureDateTime = new Date(formData.dtaSignatureDateTime).getTime() / 1000;
      
      await db.query(`
        UPDATE aft_requests 
        SET dta_signature_date = ?,
            sme_id = ?,
            assigned_sme_id = ?,
            status = 'pending_sme_signature',
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = ?
      `).run(signatureDateTime, formData.smeUserId, formData.smeUserId, requestId);

      RequestTrackingService.addAuditEntry(
        requestId,
        userId,
        'dta_signed_form',
        'active_transfer',
        'pending_sme_signature',
        JSON.stringify({ smeUserId: formData.smeUserId, smeName: smeUser.name }),
        `DTA signature completed via form. Assigned to SME ${smeUser.name}. ${formData.dtaSignatureNotes || ''}`
      );

      await auditLog(userId, 'DTA_SIGNATURE_FORM', `Signed request #${requestId} via transfer form`, ipAddress, { requestId, smeUserId: formData.smeUserId });
      dtaSignedPerformed = true;
    }

    // Add scan notes if provided
    if (formData.scanNotes) {
      RequestTrackingService.addAuditEntry(
        requestId,
        userId,
        'scan_notes_added',
        undefined,
        'active_transfer',
        JSON.stringify({ notes: formData.scanNotes }),
        `Scan notes added: ${formData.scanNotes}`
      );
    }

    const message = saveOnly ? 'Progress saved successfully' : 'Transfer form submitted successfully';
    
    return new Response(JSON.stringify({ 
      success: true, 
      message,
      requestId,
      transferCompleted: transferCompletedPerformed,
      movedToPendingSME: dtaSignedPerformed
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Transfer form submission error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process transfer form' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function completeTransfer(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  // Only allow assigned DTA to complete the transfer
  const request = await db.query("SELECT * FROM aft_requests WHERE id = ? AND dta_id = ?").get(requestId, userId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'active_transfer') {
    return new Response(JSON.stringify({ error: 'Request is not in active transfer status' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate that both scans have been performed
  if (!request.origination_scan_performed || !request.destination_scan_performed) {
    return new Response(JSON.stringify({ 
      error: 'Both origination and destination anti-virus scans must be completed before transfer completion',
      requiresScans: {
        origination: !request.origination_scan_performed,
        destination: !request.destination_scan_performed
      }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { filesTransferred, smeUserId, tpiMaintained, notes } = body;

  // Validate required fields
  if (!filesTransferred) {
    return new Response(JSON.stringify({ 
      error: 'Files transferred count is required' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request with transfer completion data - keep in active_transfer until DTA signs
  await db.query(`
    UPDATE aft_requests 
    SET transfer_completed_date = EXTRACT(EPOCH FROM NOW())::BIGINT,
        files_transferred_count = ?,
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = ?
  `).run(filesTransferred, requestId);
  
  // Update SME assignment if provided
  if (smeUserId) {
    await db.query(`
      UPDATE aft_requests 
      SET sme_id = ?
      WHERE id = ?
    `).run(smeUserId, requestId);
  }

  // Log the transfer completion
  RequestTrackingService.addAuditEntry(
    requestId,
    userId,
    'transfer_completed',
    'active_transfer',
    'active_transfer',
    JSON.stringify({ filesTransferred, notes }),
    `Transfer completed by ${userEmail}. ${filesTransferred} files transferred.`
  );

  // Security audit log
  await auditLog(userId, 'TRANSFER_COMPLETION', `Completed transfer for request #${requestId}`, ipAddress, {
    requestId,
    filesTransferred,
    smeUserId,
    tpiMaintained
  });

  return new Response(JSON.stringify({
    success: true,
    message: 'Transfer completed successfully. Ready for DTA signature.',
    newStatus: 'active_transfer',
    filesTransferred,
    requiresDtaSignature: true
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Sign transfer manually (without CAC)
async function signTransferManual(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const { smeUserId, notes, signatureMethod, filesTransferred, transferDateTime, transferNotes } = body;
  
  try {
    // Verify request exists and DTA has access
    const request = await db.query(`
      SELECT id, status, request_number 
      FROM aft_requests 
      WHERE id = ? AND dta_id = ?
    `).get(requestId, userId) as any;
    
    if (!request) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Transfer not found or access denied' 
      }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    
    if (!smeUserId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'SME selection is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate transfer completion data
    if (!filesTransferred || filesTransferred < 1) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Number of files transferred is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update transfer completion data first
    const transferTimestamp = transferDateTime ? new Date(transferDateTime).getTime() / 1000 : Math.floor(Date.now() / 1000);

    await db.query(`
      UPDATE aft_requests
      SET transfer_completed_date = ?,
          files_transferred_count = ?,
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = ?
    `).run(transferTimestamp, parseInt(filesTransferred), requestId);

    // Add transfer completion to audit trail
    if (transferNotes) {
      RequestTrackingService.addAuditEntry(
        requestId,
        userId,
        'transfer_completed',
        'active_transfer',
        'active_transfer',
        JSON.stringify({ filesTransferred, transferNotes }),
        `Transfer completed: ${filesTransferred} files transferred. ${transferNotes}`
      );
    }

    // Update request with DTA signature and forward to SME immediately
    await db.query(`
      UPDATE aft_requests
      SET status = 'pending_sme_signature',
          dta_signature_date = EXTRACT(EPOCH FROM NOW())::BIGINT,
          assigned_sme_id = ?,
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = ?
    `).run(smeUserId, requestId);

    // Add to request history
    await db.query(`
      INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
      VALUES (?, 'DTA_SIGNED_MANUAL', ?, ?, EXTRACT(EPOCH FROM NOW())::BIGINT)
    `).run(requestId, userEmail, `Transfer completed (${filesTransferred} files) and DTA manual signature applied. Forwarded to SME. ${notes || ''}`);

    // Log audit
    await auditLog(userId, 'DTA_MANUAL_SIGNATURE', `Manual signature applied to transfer ${requestId}`, ipAddress, {
      requestId,
      smeUserId,
      signatureMethod: 'manual'
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Transfer completed (${filesTransferred} files) and signed successfully. Forwarded to SME for verification.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error signing transfer manually:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Failed to sign transfer' 
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}

// Sign transfer with CAC certificate
async function signTransferWithCAC(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const { signature, certificate, timestamp, algorithm, smeUserId, notes, filesTransferred, transferDateTime, transferNotes } = body;
  
  try {
    // Verify request exists and DTA has access
    const request = await db.query(`
      SELECT id, status, request_number 
      FROM aft_requests 
      WHERE id = ? AND dta_id = ?
    `).get(requestId, userId) as any;
    
    if (!request) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Transfer not found or access denied' 
      }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    if (!smeUserId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'SME selection is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate transfer completion data
    if (!filesTransferred || filesTransferred < 1) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Number of files transferred is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate signature data
    if (!signature || !certificate || !timestamp || !algorithm) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid signature data' 
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    
    // Update transfer completion data first
    const transferTimestamp = transferDateTime ? new Date(transferDateTime).getTime() / 1000 : Math.floor(Date.now() / 1000);

    await db.query(`
      UPDATE aft_requests
      SET transfer_completed_date = ?,
          files_transferred_count = ?,
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = ?
    `).run(transferTimestamp, parseInt(filesTransferred), requestId);

    // Add transfer completion to audit trail
    if (transferNotes) {
      RequestTrackingService.addAuditEntry(
        requestId,
        userId,
        'transfer_completed',
        'active_transfer',
        'active_transfer',
        JSON.stringify({ filesTransferred, transferNotes }),
        `Transfer completed: ${filesTransferred} files transferred. ${transferNotes}`
      );
    }

    // Construct CAC signature data
    const signatureData: CACSignatureData = {
      signature,
      certificate,
      timestamp,
      algorithm,
      notes: `Transfer completed (${filesTransferred} files). ${notes || ''}`
    };
    
    // Apply CAC signature and forward to SME immediately
    const signatureResult = await CACSignatureManager.applyDTASignature(
      requestId,
      userId,
      userEmail,
      signatureData,
      smeUserId,
      ipAddress
    );

    if (!signatureResult.success) {
      return new Response(JSON.stringify({
        success: false,
        error: signatureResult.error || 'Failed to apply CAC signature'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Log audit
    await auditLog(userId, 'DTA_CAC_SIGNATURE', `CAC signature applied to transfer ${requestId}`, ipAddress, {
      requestId,
      smeUserId,
      certificateThumbprint: certificate.thumbprint,
      certificateSubject: certificate.subject
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Transfer completed (${filesTransferred} files) and signed with CAC signature successfully. Forwarded to SME for verification.`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error signing transfer with CAC:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to apply CAC signature'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


// Get client certificate information for CAC authentication
function getCACInfo(session?: any): Response {
  try {
    // First check if we have CAC info stored in the session
    let hasCACCert = false;
    let certInfo = null;

    if (session?.cacCertificate) {
      // Use CAC from session
      hasCACCert = true;
      certInfo = session.cacCertificate;
      console.log('Using CAC Certificate from session for DTA:', {
        subject: certInfo.subject,
        issuer: certInfo.issuer,
        serial: certInfo.serialNumber
      });
    } else {
      // No client certificate provided
      hasCACCert = false;
      certInfo = null;
      console.log('No CAC certificate found in session for DTA');
    }

    return new Response(JSON.stringify({
      hasClientCert: hasCACCert,
      certificate: certInfo
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting CAC info for DTA:', error);
    return new Response(JSON.stringify({
      hasClientCert: false,
      certificate: null,
      error: 'Failed to retrieve CAC information'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
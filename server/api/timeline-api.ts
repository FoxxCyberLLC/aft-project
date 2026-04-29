// Timeline API routes
import { getDb, type DbRow } from '../../lib/database-bun';
import { checkAuth } from '../utils';

const db = getDb();

export async function handleTimelineAPI(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response | null> {
  const method = request.method;

  // Timeline API for requests
  if (path.startsWith('/api/requests/') && path.endsWith('/timeline') && method === 'GET') {
    const auth = await checkAuth(request, ipAddress);
    if (!auth?.roleSelected) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const requestId = path.split('/')[3];
    if (!requestId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request ID',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    try {
      // Get request details
      let request_query = `
        SELECT ar.*, u.first_name || ' ' || u.last_name as requestor_name
        FROM aft_requests ar
        LEFT JOIN users u ON ar.requestor_id = u.id
        WHERE ar.id = ?
      `;

      // If user is a requestor, only allow access to their own requests
      if (auth.activeRole === 'requestor') {
        request_query += ` AND ar.requestor_id = ?`;
      }

      const requestData =
        auth.activeRole === 'requestor'
          ? ((await db.query(request_query).get(requestId, auth.userId)) as DbRow)
          : ((await db.query(request_query).get(requestId)) as DbRow);

      if (!requestData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Request not found or access denied',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Get timeline data using the existing RequestTrackingService
      const { RequestTrackingService } = await import('../../lib/request-tracking');
      const timelineData = RequestTrackingService.getRequestTimeline(parseInt(requestId, 10));

      if (!timelineData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeline data not available',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          request: requestData,
          timeline: timelineData,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: unknown) {
      console.error('Error fetching timeline:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch timeline data',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  return null;
}

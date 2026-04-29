// Requestor page routes

import { ChevronLeftIcon } from '../../components/icons';
import { getDb, type DbRow } from '../../lib/database-bun';
import { RoleMiddleware } from '../../middleware/role-middleware';
import { RequestorAllRequests } from '../../requestor/all-requests';
import { RequestorDashboard } from '../../requestor/dashboard';
import { RequestWizard } from '../../requestor/request-wizard';
import { RequestorRequests } from '../../requestor/requests';
import { createHtmlPage } from '../utils';

const db = getDb();

// Requestor Routes Handler
export async function handleRequestorRoutes(
  request: Request,
  path: string,
  ipAddress: string,
): Promise<Response> {
  // Allow any authenticated user to access requestor routes (all users can be requestors)
  const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
  if (authResult.response) return authResult.response;

  const user = {
    email: authResult.session.email,
    role: authResult.session.activeRole || authResult.session.primaryRole,
  };

  switch (path) {
    case '/requestor': {
      const dashboardHtml = await RequestorDashboard.render(user, authResult.session.userId);
      return new Response(
        createHtmlPage('AFT - Requestor Dashboard', dashboardHtml, RequestorDashboard.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/requestor/requests': {
      const requestsUrl = new URL(request.url);
      const viewMode = (requestsUrl.searchParams.get('view') as 'table' | 'timeline') || 'table';
      const requestsHtml = await RequestorRequests.render(
        user,
        viewMode,
        authResult.session.userId,
      );
      return new Response(
        createHtmlPage('AFT - My Requests', requestsHtml, RequestorRequests.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/requestor/all-requests': {
      const allUrl = new URL(request.url);
      const allViewMode = (allUrl.searchParams.get('view') as 'table' | 'timeline') || 'table';
      const allHtml = await RequestorAllRequests.render(user, allViewMode);
      return new Response(
        createHtmlPage('AFT - All Requests', allHtml, RequestorAllRequests.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    case '/requestor/new-request': {
      const url = new URL(request.url);
      const draftId = url.searchParams.get('draft')
        ? parseInt(url.searchParams.get('draft')!, 10)
        : undefined;
      const wizardHtml = await RequestWizard.render(user, authResult.session.userId, draftId);
      return new Response(
        createHtmlPage('AFT - New Request', wizardHtml, RequestWizard.getScript()),
        {
          headers: { 'Content-Type': 'text/html' },
        },
      );
    }

    default:
      // Handle individual request routes like /requestor/requests/123
      if (path.startsWith('/requestor/requests/')) {
        const requestId = path.split('/')[3];
        if (requestId && !Number.isNaN(parseInt(requestId, 10))) {
          return await handleRequestDetailPage(
            request,
            parseInt(requestId, 10),
            user,
            authResult.session.userId,
          );
        }
      }
      return Response.redirect('/requestor', 302);
  }
}

// Handle individual request detail page
export async function handleRequestDetailPage(
  _request: Request,
  requestId: number,
  _user: any,
  userId: number,
): Promise<Response> {
  // Get request details - ensure requestor can only view their own requests
  const requestData = (await db
    .query(`
    SELECT ar.*, u.first_name || ' ' || u.last_name as requestor_name
    FROM aft_requests ar
    LEFT JOIN users u ON ar.requestor_id = u.id
    WHERE ar.id = ? AND ar.requestor_id = ?
  `)
    .get(requestId, userId)) as DbRow;

  if (!requestData) {
    return new Response('Request not found or access denied', { status: 404 });
  }

  // Get timeline data
  const { RequestTrackingService } = await import('../../lib/request-tracking');
  const timelineData = await RequestTrackingService.getRequestTimeline(requestId);

  // Get CAC signature data for this request
  const cacSignature = (await db
    .query(`
    SELECT cs.*, u.first_name || ' ' || u.last_name as signer_name
    FROM cac_signatures cs
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE cs.request_id = ?
    ORDER BY cs.created_at DESC
    LIMIT 1
  `)
    .get(requestId)) as DbRow;

  // Parse files list
  let files = [];
  try {
    files = JSON.parse(requestData.files_list || '[]');
  } catch (_e) {
    files = [];
  }

  const canSubmit = requestData.status === 'draft';
  const canEdit = ['draft'].includes(requestData.status);

  const detailHtml = `
    <div class="min-h-screen bg-[var(--background)]">
      <div class="container mx-auto px-4 py-8">
        <div class="mb-6">
          <div class="flex items-center gap-2 mb-4">
            <a href="/requestor/requests" class="text-[var(--primary)] hover:underline inline-flex items-center gap-1">
              <span class="inline-block align-middle">${ChevronLeftIcon({ size: 16 })}</span>
              <span>Back to My Requests</span>
            </a>
          </div>
          <h1 class="text-3xl font-bold text-[var(--foreground)]">Request Details</h1>
          <p class="text-[var(--muted-foreground)]">Request #${requestData.request_number}</p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-6">
            ${
              requestData.status === 'rejected' && requestData.rejection_reason
                ? `
            <div class="border-2 border-[var(--destructive)] bg-[var(--destructive)]/10 text-[var(--destructive)] rounded-lg p-4">
              <div class="font-semibold mb-1">Request Rejected</div>
              <div class="text-sm">Reason: ${requestData.rejection_reason}</div>
              <div class="text-xs text-[var(--muted-foreground)] mt-1">This request has been rejected and cannot be modified. Please create a new request if needed.</div>
            </div>
            `
                : ''
            }
            <!-- Request Information -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Request Information</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Type</label>
                  <div class="text-[var(--foreground)]">${requestData.transfer_type || 'Not specified'}</div>
                </div>
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Classification</label>
                  <div class="text-[var(--foreground)]">${requestData.classification || 'Not specified'}</div>
                </div>
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Source System</label>
                  <div class="text-[var(--foreground)]">${requestData.source_system || 'Not specified'}</div>
                </div>
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Destination System</label>
                  <div class="text-[var(--foreground)]">${requestData.dest_system || 'Not specified'}</div>
                </div>
                <div class="md:col-span-2">
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Purpose</label>
                  <div class="text-[var(--foreground)]">${requestData.transfer_purpose || 'Not specified'}</div>
                </div>
              </div>
            </div>
            
            <!-- Files List -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Files to Transfer</h2>
              ${
                files.length > 0
                  ? `
                <div class="space-y-2">
                  ${files
                    .map((file: any) => {
                      const base = (file?.name || '').toString();
                      const ext = (file?.type || '').toString();
                      const fullName = base && ext ? `${base}.${ext}` : base || '(unnamed)';
                      const size = (file?.size || '').toString().trim();
                      const sizeDisplay = size ? size : 'Size not specified';
                      const classification = file?.classification || 'No classification';
                      return `
                      <div class="flex items-center justify-between p-3 bg-[var(--muted)] rounded">
                        <div>
                          <div class="font-medium">${fullName}</div>
                          <div class="text-xs text-[var(--muted-foreground)]">${sizeDisplay}</div>
                        </div>
                        <div class="text-sm text-[var(--muted-foreground)]">${classification}</div>
                      </div>
                    `;
                    })
                    .join('')}
                </div>
              `
                  : '<p class="text-[var(--muted-foreground)]">No files specified</p>'
              }
            </div>
            
            <!-- CAC Digital Signature -->
            ${
              cacSignature
                ? `
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                </svg>
                CAC Digital Signature
              </h2>
              <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="text-sm font-medium text-gray-600">Signed By</label>
                    <div class="text-gray-900 font-medium">${cacSignature.signer_name || cacSignature.signer_email}</div>
                  </div>
                  <div>
                    <label class="text-sm font-medium text-gray-600">Signature Date</label>
                    <div class="text-gray-900">${new Date(cacSignature.signature_timestamp).toLocaleString()}</div>
                  </div>
                  <div>
                    <label class="text-sm font-medium text-gray-600">Certificate Subject</label>
                    <div class="text-gray-900 text-sm font-mono break-all">${cacSignature.certificate_subject}</div>
                  </div>
                  <div>
                    <label class="text-sm font-medium text-gray-600">Certificate Issuer</label>
                    <div class="text-gray-900 text-sm font-mono break-all">${cacSignature.certificate_issuer}</div>
                  </div>
                  <div>
                    <label class="text-sm font-medium text-gray-600">Certificate Serial</label>
                    <div class="text-gray-900 font-mono">${cacSignature.certificate_serial}</div>
                  </div>
                  <div>
                    <label class="text-sm font-medium text-gray-600">Signature Algorithm</label>
                    <div class="text-gray-900">${cacSignature.signature_algorithm}</div>
                  </div>
                  <div>
                    <label class="text-sm font-medium text-gray-600">Certificate Valid From</label>
                    <div class="text-gray-900">${new Date(cacSignature.certificate_not_before * 1000).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <label class="text-sm font-medium text-gray-600">Certificate Valid To</label>
                    <div class="text-gray-900">${new Date(cacSignature.certificate_not_after * 1000).toLocaleDateString()}</div>
                  </div>
                </div>
                <div class="mt-4 pt-4 border-t border-green-200">
                  <label class="text-sm font-medium text-gray-600">Digital Signature Hash</label>
                  <div class="text-gray-900 text-xs font-mono break-all bg-gray-50 p-2 rounded mt-1">${cacSignature.signature_data}</div>
                </div>
                ${
                  cacSignature.notes
                    ? `
                <div class="mt-3">
                  <label class="text-sm font-medium text-gray-600">Notes</label>
                  <div class="text-gray-900">${cacSignature.notes}</div>
                </div>
                `
                    : ''
                }
              </div>
            </div>
            `
                : ''
            }
            
            ${
              canSubmit
                ? `
            <!-- Submission Section -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Review & Submit Request</h2>
              <div class="space-y-4">
                <div class="p-4 bg-[var(--muted)] rounded-lg">
                  <h3 class="font-medium mb-2">Certification Statement</h3>
                  <p class="text-sm text-[var(--muted-foreground)]">
                    I certify that the above file(s)/media to be transferred to/from the IS are required to support 
                    the development and sustainment contractual efforts and comply with all applicable security requirements.
                  </p>
                </div>
                
                <!-- Signature Method Selection -->
                <div class="p-4 bg-[var(--muted)] rounded-lg">
                  <h3 class="font-medium mb-3">Signature Method</h3>
                  <div class="space-y-3">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="signature_method" value="manual" checked class="text-[var(--primary)]">
                      <span class="text-sm">Manual Signature - Type your name</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="signature_method" value="cac" class="text-[var(--primary)]">
                      <span class="text-sm">CAC Certificate - Automatic via HTTPS</span>
                    </label>
                  </div>
                  
                  <!-- Manual Signature Input -->
                  <div id="manual-signature-area" class="mt-4">
                    <label for="manual-signature" class="block text-sm font-medium mb-1">Type your full name to sign</label>
                    <input 
                      type="text" 
                      id="manual-signature" 
                      placeholder="Enter your full legal name"
                      class="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    >
                  </div>
                  
                  <!-- CAC Signature Info -->
                  <div id="cac-signature-area" class="mt-4 hidden">
                    <div id="cac-status-loading" class="flex items-center gap-2 p-3 bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg">
                      <div class="w-2 h-2 rounded-full bg-[var(--info)]"></div>
                      <span class="text-sm text-[var(--info)]">Checking for CAC certificate...</span>
                    </div>
                    <div id="cac-status-found" class="hidden flex items-center gap-2 p-3 bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-lg">
                      <div class="w-2 h-2 rounded-full bg-[var(--success)]"></div>
                      <div class="flex-1">
                        <span class="text-sm text-[var(--success)]">CAC certificate detected</span>
                        <div id="cac-cert-details" class="text-xs text-[var(--muted-foreground)] mt-1"></div>
                      </div>
                    </div>
                    <div id="cac-status-not-found" class="hidden flex items-center gap-2 p-3 bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 rounded-lg">
                      <div class="w-2 h-2 rounded-full bg-[var(--destructive)]"></div>
                      <div class="flex-1">
                        <span class="text-sm text-[var(--destructive)]">No CAC certificate found</span>
                        <div class="text-xs text-[var(--muted-foreground)] mt-1">Please ensure your CAC is inserted and try refreshing the page</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="certify-checkbox" class="rounded">
                  <label for="certify-checkbox" class="text-sm">I agree to the certification statement above</label>
                </div>
                
                <button 
                  onclick="submitRequest(${requestId})" 
                  id="submit-btn"
                  disabled
                  class="action-btn primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sign & Submit Request for Review
                </button>
              </div>
            </div>
            `
                : ''
            }
          </div>
          
          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Status Card -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Status</h2>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-[var(--muted-foreground)]">Current Status</span>
                  <span class="px-2 py-1 rounded text-xs font-medium bg-[var(--muted)] text-[var(--muted-foreground)]">
                    ${requestData.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-[var(--muted-foreground)]">Created</span>
                  <span class="text-sm">${new Date(requestData.created_at * 1000).toLocaleDateString()}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-[var(--muted-foreground)]">Last Updated</span>
                  <span class="text-sm">${new Date(requestData.updated_at * 1000).toLocaleDateString()}</span>
                </div>
                ${
                  requestData.rejection_reason
                    ? `
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Rejection Reason</label>
                  <p class="text-sm text-[var(--destructive)] mt-1">${requestData.rejection_reason}</p>
                </div>
                `
                    : ''
                }
              </div>
            </div>
            
            <!-- Actions -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Actions</h2>
              <div class="space-y-2">
                ${canEdit ? `<button onclick="editRequest(${requestId})" class="w-full action-btn secondary">Edit Request Details</button>` : ''}
                ${canSubmit ? `<button onclick="window.location.href='/requestor/new-request?draft=${requestId}'" class="w-full action-btn secondary">Return to Edit Form</button>` : ''}
                <button onclick="viewTimeline(${requestId})" class="w-full action-btn secondary">View Timeline</button>
                <button onclick="window.print()" class="w-full action-btn secondary">Print Request</button>
              </div>
            </div>
            
            ${
              timelineData
                ? `
            <!-- Timeline Summary -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Timeline Progress</h2>
              <div class="space-y-2">
                ${timelineData.timeline_steps
                  .slice(0, 3)
                  .map(
                    (step) => `
                  <div class="flex items-center gap-2">
                    <div class="w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                      step.status === 'completed'
                        ? 'bg-[var(--success)] text-white'
                        : step.status === 'current'
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }">
                      ${step.status === 'completed' ? '✓' : step.status === 'current' ? '●' : '○'}
                    </div>
                    <span class="text-sm">${step.title}</span>
                  </div>
                `,
                  )
                  .join('')}
                ${
                  timelineData.timeline_steps.length > 3
                    ? `
                  <button onclick="viewTimeline(${requestId})" class="text-xs text-[var(--primary)] hover:underline">
                    View all ${timelineData.timeline_steps.length} steps
                  </button>
                `
                    : ''
                }
              </div>
            </div>
            `
                : ''
            }
          </div>
        </div>
      </div>
    </div>
  `;

  const script = `
    // Handle signature method toggle
    const signatureRadios = document.querySelectorAll('input[name="signature_method"]');
    const manualArea = document.getElementById('manual-signature-area');
    const cacArea = document.getElementById('cac-signature-area');
    
    signatureRadios.forEach(radio => {
      radio.addEventListener('change', function() {
        if (this.value === 'manual') {
          manualArea.style.display = 'block';
          cacArea.style.display = 'none';
        } else if (this.value === 'cac') {
          manualArea.style.display = 'none';
          cacArea.style.display = 'block';
          checkCACCertificate();
        }
      });
    });
    
    // Function to check for CAC certificate
    function checkCACCertificate() {
      const loadingStatus = document.getElementById('cac-status-loading');
      const foundStatus = document.getElementById('cac-status-found');
      const notFoundStatus = document.getElementById('cac-status-not-found');
      const certDetails = document.getElementById('cac-cert-details');
      
      // Show loading state
      loadingStatus.style.display = 'flex';
      foundStatus.style.display = 'none';
      notFoundStatus.style.display = 'none';
      
      // Check for client certificate
      fetch('/api/requestor/cac-info')
        .then(response => response.json())
        .then(data => {
          loadingStatus.style.display = 'none';
          
          if (data.hasClientCert && data.certificate) {
            foundStatus.style.display = 'flex';
            certDetails.innerHTML = \`Subject: \${data.certificate.subject}<br>Serial: \${data.certificate.serialNumber}\`;
            
            // Store certificate info for submission
            window.cacCertificateInfo = data.certificate;
          } else {
            notFoundStatus.style.display = 'flex';
            window.cacCertificateInfo = null;
          }
        })
        .catch(error => {
          console.error('Error checking CAC certificate:', error);
          loadingStatus.style.display = 'none';
          notFoundStatus.style.display = 'flex';
          window.cacCertificateInfo = null;
        });
    }
    
    // Enable submit button when checkbox is checked
    const checkbox = document.getElementById('certify-checkbox');
    const submitBtn = document.getElementById('submit-btn');
    
    if (checkbox && submitBtn) {
      checkbox.addEventListener('change', function() {
        submitBtn.disabled = !this.checked;
      });
    }
    
    function submitRequest(requestId) {
      if (!document.getElementById('certify-checkbox').checked) {
        alert('Please certify the request before submitting.');
        return;
      }
      
      const signatureMethod = document.querySelector('input[name="signature_method"]:checked').value;
      let manualSignature = null;
      let cacCertificate = null;
      
      if (signatureMethod === 'manual') {
        manualSignature = document.getElementById('manual-signature').value.trim();
        if (!manualSignature) {
          alert('Please enter your full name to sign the request.');
          return;
        }
      } else if (signatureMethod === 'cac') {
        if (!window.cacCertificateInfo) {
          alert('No CAC certificate detected. Please ensure your CAC is inserted and try refreshing the page.');
          return;
        }
        cacCertificate = window.cacCertificateInfo;
      }
      
      // Disable button and show loading state
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      
      fetch('/api/requestor/submit-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: requestId,
          signatureMethod: signatureMethod,
          manualSignature: manualSignature,
          cacCertificate: cacCertificate
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Request submitted successfully! It is now pending review.');
          window.location.href = '/requestor/requests';
        } else {
          alert('Failed to submit request: ' + (data.message || 'Unknown error'));
          btn.disabled = false;
          btn.textContent = 'Sign & Submit Request for Review';
        }
      })
      .catch(error => {
        console.error('Error submitting request:', error);
        alert('Failed to submit request. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Sign & Submit Request for Review';
      });
    }
    
    function editRequest(requestId) {
      window.location.href = '/requestor/new-request?draft=' + requestId;
    }
    
    function viewTimeline(requestId) {
      fetch(\`/api/requests/\${requestId}/timeline\`)
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showTimelineModal(data.request, data.timeline);
          } else {
            alert('Failed to load timeline data: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error fetching timeline:', error);
          alert('Failed to load timeline data. Please try again.');
        });
    }
    
    function showTimelineModal(request, timelineData) {
      const modalBackdrop = document.createElement('div');
      modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) {
          document.body.removeChild(modalBackdrop);
        }
      };
      
      const modalContent = document.createElement('div');
      modalContent.className = 'bg-[var(--background)] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden';
      
      const timelineHtml = \`
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-2xl font-bold text-[var(--foreground)]">Request Timeline</h2>
              <p class="text-[var(--muted-foreground)]">Request #\${request.request_number}</p>
            </div>
            <button onclick="this.closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl font-bold">&times;</button>
          </div>
          
          <div class="max-h-[60vh] overflow-y-auto">
            <div class="space-y-4">
              \${timelineData.timeline_steps.map((step, index) => \`
                <div class="flex items-start space-x-4 pb-4 \${index < timelineData.timeline_steps.length - 1 ? 'border-b border-[var(--border)]' : ''}">
                  <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium \${
                    step.status === 'completed' ? 'bg-[var(--success)] text-white' :
                    step.status === 'current' ? 'bg-[var(--primary)] text-white' :
                    'bg-[var(--muted)] text-[var(--muted-foreground)]'
                  }">
                    \${step.status === 'completed' ? '✓' : step.status === 'current' ? '●' : '○'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <h4 class="text-sm font-medium text-[var(--foreground)]">\${step.title}</h4>
                      \${step.timestamp ? \`<time class="text-xs text-[var(--muted-foreground)]">\${new Date(step.timestamp * 1000).toLocaleString()}</time>\` : ''}
                    </div>
                    \${step.description ? \`<p class="text-sm text-[var(--muted-foreground)] mt-1">\${step.description}</p>\` : ''}
                    \${step.assignedTo ? \`<p class="text-xs text-[var(--muted-foreground)] mt-1">Assigned to: \${step.assignedTo}</p>\` : ''}
                    \${step.notes ? \`<p class="text-xs text-[var(--muted-foreground)] mt-2 p-2 bg-[var(--muted)] rounded">\${step.notes}</p>\` : ''}
                  </div>
                </div>
              \`).join('')}
            </div>
          </div>
        </div>
      \`;
      
      modalContent.innerHTML = timelineHtml;
      modalBackdrop.appendChild(modalContent);
      document.body.appendChild(modalBackdrop);
    }
  `;

  return new Response(
    createHtmlPage(`AFT - Request #${requestData.request_number}`, detailHtml, script),
    {
      headers: { 'Content-Type': 'text/html' },
    },
  );
}

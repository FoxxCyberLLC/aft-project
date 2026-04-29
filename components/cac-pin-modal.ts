// CAC PIN Authentication Modal Component

import { AlertTriangleIcon, KeyIcon, ShieldIcon } from './icons';
import { ComponentBuilder } from './ui/server-components';

function render(isVisible: boolean = false): string {
  return `
    <div id="cac-pin-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 ${isVisible ? 'flex' : 'hidden'} items-center justify-center">
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] shadow-2xl max-w-md w-full mx-4 animate-in fade-in-0 zoom-in-95 duration-300">
        <!-- Modal Header -->
        <div class="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <div class="flex items-center gap-3">
            ${ShieldIcon({ size: 24, color: 'var(--primary)' })}
            <h2 class="text-xl font-semibold text-[var(--foreground)]">CAC Authentication</h2>
          </div>
          <button onclick="closeCACPinModal()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Modal Content -->
        <div class="p-6 space-y-6">
          <!-- CAC Status -->
          <div id="cac-status" class="hidden">
            <div class="flex items-center justify-between p-4 bg-[var(--muted)] rounded-lg">
              <div class="flex items-center gap-3">
                ${KeyIcon({ size: 20 })}
                <div>
                  <p class="text-sm font-medium text-[var(--foreground)]">CAC Card Detected</p>
                  <p id="cac-reader-info" class="text-xs text-[var(--muted-foreground)]"></p>
                </div>
              </div>
              <div id="cac-status-indicator" class="w-3 h-3 rounded-full bg-[var(--success)]"></div>
            </div>
          </div>

          <!-- Certificate Selection -->
          <div id="certificate-selection" class="hidden space-y-3">
            <label class="text-sm font-medium text-[var(--foreground)]">Select Certificate</label>
            <select id="certificate-select" class="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
              <option value="">Loading certificates...</option>
            </select>
          </div>

          <!-- Certificate Access Info -->
          <div class="space-y-3">
            <h4 class="text-sm font-medium text-[var(--foreground)]">Certificate Access</h4>
            <div class="bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg p-4">
              <div class="flex items-start gap-3">
                ${ShieldIcon({ size: 20, color: 'var(--info)' })}
                <div class="text-sm">
                  <p class="font-medium text-[var(--info)] mb-1">Browser-Based Authentication</p>
                  <p class="text-[var(--info)]/80 text-xs leading-relaxed">
                    Your browser will request your CAC certificate and prompt for PIN entry through the secure OS-level interface. 
                    This ensures your PIN never passes through the web application.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Error Message -->
          <div id="cac-error" class="hidden bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 rounded-lg p-4">
            <div class="flex items-center gap-3">
              ${AlertTriangleIcon({ size: 20, color: 'var(--destructive)' })}
              <div>
                <p class="text-sm font-medium text-[var(--destructive)]">Authentication Error</p>
                <p id="cac-error-message" class="text-xs text-[var(--destructive)]/80"></p>
              </div>
            </div>
          </div>

          <!-- Security Notice -->
          <div class="bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg p-4">
            <div class="flex items-start gap-3">
              ${ShieldIcon({ size: 20, color: 'var(--info)' })}
              <div class="text-sm">
                <p class="font-medium text-[var(--info)] mb-1">Security Notice</p>
                <p class="text-[var(--info)]/80 text-xs leading-relaxed">
                  Your CAC PIN will be used to access your certificate for digital signature. 
                  After 3 incorrect attempts, your card may be locked requiring administrative unlock.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-end gap-3 p-6 border-t border-[var(--border)]">
          <button
            onclick="closeCACPinModal()"
            class="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Cancel
          </button>
          ${ComponentBuilder.primaryButton({
            children: 'Authenticate & Sign',
            onClick: 'authenticateAndSign()',
            id: 'cac-authenticate-btn',
            className: 'min-w-[140px]',
            disabled: true,
          })}
        </div>
      </div>
    </div>
  `;
}

function getScript(): string {
  return `
    // CAC PIN Modal JavaScript using Web Crypto API
    let cacWebCrypto = null;
    let selectedCertificate = null;
    let signRequestId = null;
    let certificateRequestAttempts = 0;
    const maxAttempts = 3;

    // Initialize CAC Web Crypto functionality
    async function initializeCAC() {
      try {
        // Import CAC Web Crypto library
        const { AFTCertificateSelector } = await import('/lib/cac-web-crypto.js');
        cacWebCrypto = new AFTCertificateSelector();

        return true;
      } catch (error) {
        console.error('Failed to initialize CAC Web Crypto:', error);
        showCACError('Failed to initialize CAC certificate access. Please ensure your browser supports Web Crypto API.');
        return false;
      }
    }

    // Show CAC PIN modal
    async function showCACPinModal(requestId) {
      signRequestId = requestId;
      certificateRequestAttempts = 0;
      
      const modal = document.getElementById('cac-pin-modal');
      if (!modal) {
        console.error('CAC PIN modal not found');
        return;
      }

      // Show modal
      modal.classList.remove('hidden');
      modal.style.display = 'flex';

      // Initialize CAC Web Crypto if not already done
      if (!cacWebCrypto) {
        const initialized = await initializeCAC();
        if (!initialized) return;
      }

      // Show initial status
      showCACStatus('Ready to access CAC certificate...', 'info');
      
      // Hide certificate selection initially - will show after certificate request
      const certificateSelection = document.getElementById('certificate-selection');
      if (certificateSelection) {
        certificateSelection.style.display = 'none';
      }

      // Focus on the authenticate button instead of PIN (PIN entry happens at OS level)
      setTimeout(() => {
        const authenticateBtn = document.getElementById('cac-authenticate-btn');
        if (authenticateBtn) {
          authenticateBtn.disabled = false;
          authenticateBtn.focus();
        }
      }, 300);
    }

    // Close CAC PIN modal
    function closeCACPinModal() {
      const modal = document.getElementById('cac-pin-modal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
      }

      // Reset form
      resetCACForm();

      // Disconnect from CAC reader
      if (cacReader) {
        cacReader.disconnect();
      }
    }

    // Reset CAC form
    function resetCACForm() {
      document.getElementById('cac-pin').value = '';
      document.getElementById('cac-error').classList.add('hidden');
      document.getElementById('cac-authenticate-btn').disabled = true;
      resetPinStrengthIndicator();
      selectedCertificate = null;
      availableCertificates = [];
    }

    // Refresh CAC status
    async function refreshCACStatus() {
      if (!cacReader) return;

      try {
        const status = await cacReader.getStatus();
        handleCACStatus(status);

        if (status.cardPresent) {
          const certificates = await cacReader.readCertificates();
          handleCACCertificates(certificates);
        }
      } catch (error) {
        handleCACError({ message: error.message });
      }
    }

    // Handle CAC status updates
    function handleCACStatus(status) {
      const statusElement = document.getElementById('cac-status');
      const readerInfo = document.getElementById('cac-reader-info');
      const indicator = document.getElementById('cac-status-indicator');

      if (status.isConnected) {
        statusElement.classList.remove('hidden');
        
        if (status.cardPresent) {
          readerInfo.textContent = status.readerName || 'CAC Reader Connected';
          indicator.className = 'w-3 h-3 rounded-full bg-[var(--success)]';
        } else {
          readerInfo.textContent = 'Please insert your CAC card';
          indicator.className = 'w-3 h-3 rounded-full bg-[var(--warning)]';
        }
      } else {
        showCACError(status.error || 'CAC reader not connected');
      }
    }

    // Handle CAC certificates
    function handleCACCertificates(certificates) {
      availableCertificates = certificates;
      const select = document.getElementById('certificate-select');
      const selection = document.getElementById('certificate-selection');

      if (certificates.length === 0) {
        showCACError('No signing certificates found on CAC card');
        return;
      }

      // Populate certificate dropdown
      select.innerHTML = '';
      certificates.forEach((cert, index) => {
        const option = document.createElement('option');
        option.value = cert.thumbprint;
        option.textContent = formatCertificateDisplay(cert);
        select.appendChild(option);
      });

      // Select first certificate by default
      if (certificates.length > 0) {
        select.value = certificates[0].thumbprint;
        selectedCertificate = certificates[0];
        selection.classList.remove('hidden');
        validateForm();
      }
    }

    // Handle CAC signature result
    function handleCACSignature(result) {
      console.log('CAC signature completed:', result);
      
      // Submit signature to server
      submitCACSignature(signRequestId, result);
    }

    // Handle CAC errors
    function handleCACError(error) {
      console.error('CAC error:', error);
      showCACError(error.message);
      
      pinAttempts++;
      if (pinAttempts >= maxPinAttempts) {
        showCACError('Maximum PIN attempts exceeded. Please remove and reinsert your CAC card.');
        document.getElementById('cac-authenticate-btn').disabled = true;
      }
    }

    // Show CAC error message
    function showCACError(message) {
      const errorElement = document.getElementById('cac-error');
      const errorMessage = document.getElementById('cac-error-message');
      
      errorMessage.textContent = message;
      errorElement.classList.remove('hidden');
    }

    // Show CAC status message
    function showCACStatus(message, type = 'info') {
      const readerInfo = document.getElementById('cac-reader-info');
      const indicator = document.getElementById('cac-status-indicator');
      
      readerInfo.textContent = message;
      
      switch (type) {
        case 'loading':
          indicator.className = 'w-3 h-3 rounded-full bg-[var(--muted)] animate-pulse';
          break;
        case 'success':
          indicator.className = 'w-3 h-3 rounded-full bg-[var(--success)]';
          break;
        case 'error':
          indicator.className = 'w-3 h-3 rounded-full bg-[var(--destructive)]';
          break;
        default:
          indicator.className = 'w-3 h-3 rounded-full bg-[var(--warning)]';
      }
    }

    // Toggle PIN visibility
    function togglePinVisibility() {
      const pinInput = document.getElementById('cac-pin');
      const eyeOpen = document.getElementById('pin-eye-open');
      const eyeClosed = document.getElementById('pin-eye-closed');

      if (pinInput.type === 'password') {
        pinInput.type = 'text';
        eyeOpen.classList.remove('hidden');
        eyeClosed.classList.add('hidden');
      } else {
        pinInput.type = 'password';
        eyeOpen.classList.add('hidden');
        eyeClosed.classList.remove('hidden');
      }
    }

    // Update PIN strength indicator
    function updatePinStrengthIndicator() {
      const pin = document.getElementById('cac-pin').value;
      const length = pin.length;

      for (let i = 1; i <= 4; i++) {
        const indicator = document.getElementById('pin-strength-' + i);
        if (i <= length && length >= 4) {
          indicator.className = 'w-2 h-2 rounded-full bg-[var(--success)]';
        } else if (i <= length) {
          indicator.className = 'w-2 h-2 rounded-full bg-[var(--warning)]';
        } else {
          indicator.className = 'w-2 h-2 rounded-full bg-[var(--muted)]';
        }
      }

      validateForm();
    }

    // Reset PIN strength indicator
    function resetPinStrengthIndicator() {
      for (let i = 1; i <= 4; i++) {
        const indicator = document.getElementById('pin-strength-' + i);
        indicator.className = 'w-2 h-2 rounded-full bg-[var(--muted)]';
      }
    }

    // Validate form
    function validateForm() {
      const pin = document.getElementById('cac-pin').value;
      const authenticateBtn = document.getElementById('cac-authenticate-btn');
      
      const isValid = pin.length >= 4 && selectedCertificate && pinAttempts < maxPinAttempts;
      authenticateBtn.disabled = !isValid;
    }

    // Authenticate and sign using Web Crypto API
    async function authenticateAndSign() {
      if (!cacWebCrypto || !signRequestId) {
        showCACError('CAC certificate access not initialized');
        return;
      }

      const authenticateBtn = document.getElementById('cac-authenticate-btn');
      authenticateBtn.disabled = true;
      authenticateBtn.textContent = 'Requesting Certificate...';

      try {
        // Hide any previous errors
        document.getElementById('cac-error').classList.add('hidden');

        // Request CAC certificate from browser - this will trigger PIN prompt at OS level
        showCACStatus('Requesting CAC certificate access...', 'loading');
        
        const certificate = await cacWebCrypto.requestCACCertificate();
        
        if (!certificate) {
          throw new Error('No certificate selected or certificate access cancelled');
        }

        selectedCertificate = certificate;
        
        // Update UI to show certificate was obtained
        showCACStatus('Certificate obtained: ' + certificate.name, 'success');
        
        // Update button text for signing phase
        authenticateBtn.textContent = 'Signing Request...';

        // Get request data for signing
        const requestData = {
          requestId: signRequestId,
          requestNumber: 'AFT-' + signRequestId,
          timestamp: new Date().toISOString()
        };

        // Sign the request data
        const signatureResult = await cacWebCrypto.signAFTRequest(requestData, certificate);
        
        // Convert ArrayBuffer signature to base64 for transmission
        const signatureBase64 = cacWebCrypto.cacWebCrypto.arrayBufferToBase64(signatureResult.signature);
        
        // Format result for submission
        const formattedResult = {
          signature: signatureBase64,
          certificate: {
            thumbprint: certificate.thumbprint,
            subject: certificate.subject,
            issuer: certificate.issuer,
            validFrom: certificate.validFrom.toISOString(),
            validTo: certificate.validTo.toISOString(),
            serialNumber: certificate.serialNumber,
            certificateData: cacWebCrypto.cacWebCrypto.arrayBufferToBase64(certificate.certificate)
          },
          timestamp: signatureResult.timestamp.toISOString(),
          algorithm: signatureResult.algorithm
        };
        
        // Handle successful signature
        handleCACSignature(formattedResult);

      } catch (error) {
        console.error('CAC authentication/signing error:', error);
        
        certificateRequestAttempts++;
        
        if (certificateRequestAttempts >= maxAttempts) {
          showCACError('Maximum certificate request attempts exceeded. Please check your CAC setup and try again.');
          authenticateBtn.disabled = true;
        } else {
          showCACError('Error: ' + error.message + '. Attempts remaining: ' + (maxAttempts - certificateRequestAttempts));
          authenticateBtn.disabled = false;
          authenticateBtn.textContent = 'Try Again';
        }
      }
    }

    // Format certificate for display
    function formatCertificateDisplay(certificate) {
      const subject = parseCertificateSubject(certificate.subject);
      const name = subject.CN || subject.commonName || 'Unknown';
      const expiry = new Date(certificate.validTo).toLocaleDateString();
      return name + ' (Expires: ' + expiry + ')';
    }

    // Parse certificate subject
    function parseCertificateSubject(subject) {
      const parsed = {};
      const parts = subject.split(',');
      
      parts.forEach(part => {
        const [key, value] = part.trim().split('=');
        if (key && value) {
          parsed[key.trim()] = value.trim();
        }
      });

      return parsed;
    }

    // Submit CAC signature to server
    async function submitCACSignature(requestId, signatureResult) {
      try {
        const response = await fetch('/api/sme/requests/' + requestId + '/sign-cac', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature: signatureResult.signature,
            certificate: signatureResult.certificate,
            timestamp: signatureResult.timestamp,
            algorithm: signatureResult.algorithm,
            notes: document.getElementById('signature-notes')?.value || ''
          })
        });

        const result = await response.json();

        if (result.success) {
          closeCACPinModal();
          alert('Request signed successfully with CAC certificate! It has been forwarded to the Media Custodian.');
          window.location.href = '/sme/requests';
        } else {
          showCACError('Server error: ' + result.error);
        }
      } catch (error) {
        console.error('Error submitting CAC signature:', error);
        showCACError('Failed to submit signature. Please try again.');
      }
    }

    // Event listeners
    document.addEventListener('DOMContentLoaded', function() {
      // PIN input event listener
      const pinInput = document.getElementById('cac-pin');
      if (pinInput) {
        pinInput.addEventListener('input', updatePinStrengthIndicator);
        pinInput.addEventListener('keypress', function(e) {
          if (e.key === 'Enter' && !document.getElementById('cac-authenticate-btn').disabled) {
            authenticateAndSign();
          }
        });
      }

      // Certificate selection event listener
      const certificateSelect = document.getElementById('certificate-select');
      if (certificateSelect) {
        certificateSelect.addEventListener('change', function() {
          const thumbprint = value;
          selectedCertificate = availableCertificates.find(cert => cert.thumbprint === thumbprint);
          validateForm();
        });
      }

      // Modal close on background click
      const modal = document.getElementById('cac-pin-modal');
      if (modal) {
        modal.addEventListener('click', function(e) {
          if (e.target === modal) {
            closeCACPinModal();
          }
        });
      }
    });

    // Override the original sign function to use CAC
    function signRequestWithCAC(requestId) {
      showCACPinModal(requestId);
    }
  `;
}

export const CACPinModal = {
  render,
  getScript,
};

// CAC Integration CSS
export const CAC_STYLES = `
  /* CAC Modal Animations */
  .animate-in {
    animation: animate-in 0.3s ease-out;
  }

  .fade-in-0 {
    animation: fade-in 0.3s ease-out;
  }

  .zoom-in-95 {
    animation: zoom-in 0.3s ease-out;
  }

  @keyframes animate-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes zoom-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* PIN Input Styling */
  #cac-pin:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary)/20;
  }

  /* Certificate Select Styling */
  #certificate-select:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary)/20;
  }

  /* Status Indicator Pulse Animation */
  .animate-pulse {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Button Loading State */
  .button-loading {
    pointer-events: none;
    opacity: 0.7;
  }

  .button-loading::after {
    content: '';
    width: 16px;
    height: 16px;
    margin-left: 8px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

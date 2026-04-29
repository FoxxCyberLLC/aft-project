// Server utility functions
import { type SecureSession, validateSession } from '../lib/security';

// Check authentication with role validation
export async function checkAuth(
  request: Request,
  ipAddress: string,
): Promise<SecureSession | null> {
  const cookies = request.headers.get('cookie');
  if (!cookies) return null;

  const sessionMatch = cookies.match(/session=([^;]+)/);
  if (!sessionMatch?.[1]) return null;

  const userAgent = request.headers.get('user-agent') || 'unknown';

  return await validateSession(sessionMatch[1], ipAddress, userAgent);
}

// Create HTML page wrapper
export function createHtmlPage(title: string, content: string, script?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="/globals.css">
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    <div class="page-wrapper">
        ${content}
    </div>
    ${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

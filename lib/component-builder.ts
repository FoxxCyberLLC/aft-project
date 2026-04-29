// Component Builder for creating full page layouts
// This module provides utilities for building complete HTML pages with consistent structure

export interface PageOptions {
  title: string;
  content: string;
  scripts?: string[];
  styles?: string[];
  meta?: Record<string, string>;
}

/**
 * Creates a complete HTML page with the given options
 */
function createPage(options: PageOptions): string {
  const { title, content, scripts = [], styles = [], meta = {} } = options;

  // Build meta tags
  const metaTags = Object.entries(meta)
    .map(([name, content]) => `<meta name="${name}" content="${content}">`)
    .join('\n    ');

  // Build script tags
  const scriptTags = scripts.map((script) => `<script>${script}</script>`).join('\n    ');

  // Build style tags
  const styleTags = styles.map((style) => `<style>${style}</style>`).join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="/globals.css">
  ${metaTags}
  ${styleTags}
</head>
<body>
  ${content}
  ${scriptTags}
</body>
</html>`;
}

/**
 * Creates a page with common AFT system styling and structure
 */
function createAFTPage(options: PageOptions): string {
  const enhancedOptions = {
    ...options,
    styles: [
      ...(options.styles || []),
      `
      :root {
        --background: #ffffff;
        --foreground: #0f172a;
        --card: #ffffff;
        --card-foreground: #0f172a;
        --popover: #ffffff;
        --popover-foreground: #0f172a;
        --primary: #0f172a;
        --primary-foreground: #f8fafc;
        --secondary: #f1f5f9;
        --secondary-foreground: #0f172a;
        --muted: #f1f5f9;
        --muted-foreground: #64748b;
        --accent: #f1f5f9;
        --accent-foreground: #0f172a;
        --destructive: #ef4444;
        --destructive-foreground: #f8fafc;
        --border: #e2e8f0;
        --input: #e2e8f0;
        --ring: #0f172a;
      }
      
      @media (prefers-color-scheme: dark) {
        :root {
          --background: #0f172a;
          --foreground: #f8fafc;
          --card: #1e293b;
          --card-foreground: #f8fafc;
          --popover: #1e293b;
          --popover-foreground: #f8fafc;
          --primary: #f8fafc;
          --primary-foreground: #0f172a;
          --secondary: #1e293b;
          --secondary-foreground: #f8fafc;
          --muted: #1e293b;
          --muted-foreground: #94a3b8;
          --accent: #1e293b;
          --accent-foreground: #f8fafc;
          --destructive: #7f1d1d;
          --destructive-foreground: #f8fafc;
          --border: #1e293b;
          --input: #1e293b;
          --ring: #f8fafc;
        }
      }
      `,
    ],
  };

  return createPage(enhancedOptions);
}

export const ComponentBuilder = {
  createPage,
  createAFTPage,
};

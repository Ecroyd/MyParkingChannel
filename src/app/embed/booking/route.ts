import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const base = searchParams.get("base") || req.headers.get("origin") || "http://localhost:3002";

  // Generate the widget script
  const script = `
(function() {
  // Parking Channel Booking Widget
  const baseUrl = "${base}";
  const slug = "${slug || 'default'}";
  
  // Create widget container if it doesn't exist
  function createWidget() {
    const containers = document.querySelectorAll('.parking-channel-widget');
    
    containers.forEach(container => {
      if (container.dataset.initialized) return;
      
      const widgetSlug = container.dataset.slug || slug;
      const minHeight = container.dataset.minHeight || '460';
      const widgetBase = container.dataset.base || baseUrl;
      
      // Set up the iframe
      const iframe = document.createElement('iframe');
      iframe.src = \`\${widgetBase}/widget/\${widgetSlug}\`;
      iframe.style.width = '100%';
      iframe.style.height = minHeight + 'px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '12px';
      iframe.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      iframe.title = 'Parking Channel Booking Widget';
      
      // Add loading state
      const loadingDiv = document.createElement('div');
      loadingDiv.style.cssText = \`
        display: flex;
        align-items: center;
        justify-content: center;
        height: \${minHeight}px;
        background: #f8fafc;
        border-radius: 12px;
        color: #64748b;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      \`;
      loadingDiv.innerHTML = 'Loading booking widget...';
      
      container.appendChild(loadingDiv);
      
      // Handle iframe load
      iframe.onload = function() {
        container.removeChild(loadingDiv);
        container.appendChild(iframe);
      };
      
      // Handle iframe error
      iframe.onerror = function() {
        loadingDiv.innerHTML = 'Unable to load booking widget. Please try again later.';
        loadingDiv.style.color = '#ef4444';
      };
      
      container.dataset.initialized = 'true';
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
  
  // Also initialize on window load as fallback
  window.addEventListener('load', createWidget);
})();
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    },
  });
}

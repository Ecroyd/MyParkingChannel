import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  const code = `
  (function () {
    function initParkingChannelWidget() {
      try {
        var scripts = document.getElementsByTagName('script');
        var thisScript = scripts[scripts.length - 1];
        if (!thisScript || !thisScript.src) return;

        var url = new URL(thisScript.src);
        var base = url.searchParams.get('base') || (url.origin || '');
        var defaultSlug = url.searchParams.get('slug') || '';

        var widgets = document.querySelectorAll('.parking-channel-widget');
        if (!widgets || !widgets.length) return;

        widgets.forEach(function (el) {
          var slug = el.getAttribute('data-slug') || defaultSlug;
          var minHeight = el.getAttribute('data-min-height') || '460';
          var dataBase = el.getAttribute('data-base');

          var effectiveBase = dataBase || base;
          if (!effectiveBase || !slug) return;

          var iframeSrc = effectiveBase.replace(/\\/$/, '') + '/widget/' + slug + '?embedded=1';

          var iframe = document.createElement('iframe');
          iframe.src = iframeSrc;
          iframe.style.width = '100%';
          iframe.style.minHeight = minHeight + 'px';
          iframe.style.border = '0';
          iframe.setAttribute('loading', 'lazy');
          iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

          while (el.firstChild) el.removeChild(el.firstChild);
          el.appendChild(iframe);
        });
      } catch (e) {
        if (console && console.warn) {
          console.warn('[Parking Channel Widget] Error initialising widget', e);
        }
      }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initParkingChannelWidget();
    } else {
      document.addEventListener('DOMContentLoaded', initParkingChannelWidget);
    }
  })();
  `;

  return new Response(code, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}

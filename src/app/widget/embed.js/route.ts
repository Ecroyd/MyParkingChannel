import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') || ''
  if (!slug) {
    return new NextResponse('/* slug required */', {
      headers: { 'Content-Type': 'text/javascript' },
    })
  }

  const appBase =
    process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || 'http://localhost:3002'

  const js = `
  (function(){
    var d=document;
    function boot(){
      var mount = document.currentScript && document.currentScript.parentElement || document.body;
      var wrap = d.createElement('div'); wrap.style.position='relative'; wrap.style.zIndex='0';
      var iframe = d.createElement('iframe');
      iframe.src='${appBase}/widget/${slug}?embedded=1';
      iframe.style.width='100%'; iframe.style.minHeight='520px'; iframe.style.border='0'; iframe.loading='lazy';
      iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
      wrap.appendChild(iframe); mount.appendChild(wrap);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  })();`
  return new NextResponse(js, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

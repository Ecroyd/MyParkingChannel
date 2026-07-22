import { getSiteSeoBundleBySlug } from "@/lib/seo";

/** Per-tenant public measurement / verification tags from site_seo_settings. */
export async function TenantIntegrations({ slug }: { slug: string }) {
  const bundle = await getSiteSeoBundleBySlug(slug);
  const settings = bundle?.settings;
  if (!settings) return null;

  const gtm = settings.google_tag_manager_id?.trim();
  const ga4 = settings.ga4_measurement_id?.trim();
  const clarity = settings.microsoft_clarity_id?.trim();

  return (
    <>
      {gtm ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm.replace(/[^A-Z0-9-]/gi, "")}');`,
          }}
        />
      ) : null}
      {ga4 && !gtm ? (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4.replace(/[^A-Z0-9-]/gi, "")}');`,
            }}
          />
        </>
      ) : null}
      {clarity ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity.replace(/[^A-Za-z0-9]/g, "")}");`,
          }}
        />
      ) : null}
    </>
  );
}

import { getSiteSeoBundleBySlug } from "@/lib/seo";
import { WebsiteFunnelBeacon } from "@/components/site/WebsiteFunnelBeacon";
import { ThirdPartyTags } from "@/components/site/ThirdPartyTags";

/** Per-tenant public measurement / verification tags from site_seo_settings. */
export async function TenantIntegrations({ slug }: { slug: string }) {
  const bundle = await getSiteSeoBundleBySlug(slug);
  const settings = bundle?.settings;
  const consentMode = settings?.cookie_consent_mode || "basic";

  return (
    <>
      <WebsiteFunnelBeacon tenantSlug={slug} cookieConsentMode={consentMode} />
      <ThirdPartyTags
        cookieConsentMode={consentMode}
        gtmId={settings?.google_tag_manager_id}
        ga4Id={settings?.ga4_measurement_id}
        clarityId={settings?.microsoft_clarity_id}
      />
    </>
  );
}

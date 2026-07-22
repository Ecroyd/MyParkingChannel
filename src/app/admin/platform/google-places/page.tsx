import { requirePlatformAdmin } from "@/lib/guards";
import PlatformGooglePlacesClient from "./PlatformGooglePlacesClient";
import { getGooglePlacesPlatformStatus } from "@/lib/google/places-reviews";

export default async function PlatformGooglePlacesPage() {
  await requirePlatformAdmin();
  const status = await getGooglePlacesPlatformStatus();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Google Places</h1>
        <p className="mt-1 text-sm text-slate-600">
          Platform integration for optional tenant Google reviews.
        </p>
      </div>
      <PlatformGooglePlacesClient
        initial={{
          configured: status.configured,
          is_enabled: status.isEnabled,
          has_env_fallback: status.hasEnvFallback,
        }}
      />
    </main>
  );
}

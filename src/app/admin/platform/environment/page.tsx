import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/guards";
import PlatformEnvironmentClient from "./PlatformEnvironmentClient";

export default async function PlatformEnvironmentPage() {
  try {
    await requirePlatformAdmin();
  } catch (error: any) {
    if (error.message?.includes("Forbidden") || error.message?.includes("Not authenticated")) {
      redirect("/admin");
    }
    throw error;
  }
  return <PlatformEnvironmentClient />;
}

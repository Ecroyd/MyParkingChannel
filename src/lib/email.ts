import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export async function getSecret(key: string) {
  const sb = await createServerClient({ admin: true });
  const { data } = await sb.from("platform_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

export async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = await getSecret("RESEND_API_KEY");
  const from = (await getSecret("FROM_EMAIL")) ?? "MyParkingChannel <no-reply@myparkingchannel.app>";
  if (!apiKey || !to) return { skipped: true };

  const resend = new Resend(apiKey);
  return await resend.emails.send({ from, to, subject, html });
}

export async function sendAdminEmail(subject: string, html: string) {
  const to = await getSecret("ADMIN_NOTIFY_EMAIL");
  if (!to) return { skipped: true };
  return sendEmail(to, subject, html);
}

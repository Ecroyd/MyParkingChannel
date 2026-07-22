import type { Metadata } from "next";
import {
  generatePrivacyMetadata,
  PrivacyPageBody,
} from "../_components/LegalPages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generatePrivacyMetadata(slug);
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PrivacyPageBody slug={slug} />;
}

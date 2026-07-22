import type { Metadata } from "next";
import {
  generateTermsMetadata,
  TermsPageBody,
} from "../_components/LegalPages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generateTermsMetadata(slug);
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TermsPageBody slug={slug} />;
}

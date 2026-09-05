import { redirect } from "next/navigation";
export default async function LegacyStudyToolsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (value) query.set(key, value);
  redirect(`/study-tools${query.size ? `?${query}` : ""}`);
}

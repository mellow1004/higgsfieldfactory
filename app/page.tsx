import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ProductionPanel from "@/components/production-panel";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ProductionPanel username={session.username} />;
}

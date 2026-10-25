import { proxyCaseRead } from "@/lib/server/case-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  return proxyCaseRead(request, caseId);
}

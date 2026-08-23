import { NextResponse } from "next/server";
import { getTargetDetail, loadEnv, recentJobs, summarizeTarget } from "@silk/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

loadEnv();

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const detail = await getTargetDetail(decodeURIComponent(name));
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    detail,
    summary: await summarizeTarget(decodeURIComponent(name)),
    jobs: await recentJobs(decodeURIComponent(name), 5),
  });
}

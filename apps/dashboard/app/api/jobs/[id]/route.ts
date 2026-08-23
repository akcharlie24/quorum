import { NextResponse } from "next/server";
import { getJob, loadEnv } from "@silk/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

loadEnv();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await getJob(Number(id));
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ job });
}

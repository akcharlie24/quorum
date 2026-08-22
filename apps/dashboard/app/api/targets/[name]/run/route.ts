import { NextResponse } from "next/server";
import { getTarget, loadEnv, startRunJob } from "@silk/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

loadEnv();

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name: raw } = await ctx.params;
  const name = decodeURIComponent(raw);
  if (!getTarget(name)) return NextResponse.json({ error: "unknown target" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { heal?: boolean };
  const jobId = startRunJob(name, { heal: body.heal ?? true });
  return NextResponse.json({ jobId });
}

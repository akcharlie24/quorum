import { NextResponse } from "next/server";
import { listTargets, loadEnv, reapStaleJobs, recentJobs, startFlockJob } from "@silk/core";
import type { FieldType, TargetSchema } from "@silk/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

loadEnv();

export async function GET() {
  await reapStaleJobs();
  return NextResponse.json({ targets: await listTargets(), jobs: await recentJobs(undefined, 6) });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    url?: string;
    itemLabel?: string;
    description?: string;
    keyField?: string;
    fields?: { name: string; type: FieldType }[];
    replace?: boolean;
  };

  const name = body.name?.trim();
  const url = body.url?.trim();
  const fields = (body.fields ?? []).filter((f) => f.name.trim());

  if (!name || !url) return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "url must start with http(s)://" }, { status: 400 });
  if (fields.length === 0) return NextResponse.json({ error: "define at least one field" }, { status: 400 });

  const keyField = body.keyField && fields.some((f) => f.name === body.keyField) ? body.keyField : fields[0].name;

  const schema: TargetSchema = {
    keyField,
    fields: Object.fromEntries(fields.map((f) => [f.name.trim(), f.type])) as Record<string, FieldType>,
    itemLabel: body.itemLabel?.trim() || "item",
    description: body.description?.trim() || undefined,
  };

  const jobId = await startFlockJob(name, url, schema, { replace: body.replace === true });
  return NextResponse.json({ jobId, name });
}

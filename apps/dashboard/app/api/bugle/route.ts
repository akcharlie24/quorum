import { NextResponse } from "next/server";
import { loadEnv, volatilityIndex } from "@silk/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

loadEnv();

export async function GET() {
  return NextResponse.json(await volatilityIndex());
}

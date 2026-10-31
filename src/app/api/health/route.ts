import { NextResponse } from "next/server";
import { supabaseEnvironment } from "@/lib/env";
export function GET() { const configured = supabaseEnvironment().success; return NextResponse.json({ status: "ok", database: configured ? "configured_not_verified" : "configuration_required" }); }

import { NextResponse, type NextRequest } from "next/server";
import { KOLACIC } from "@/lib/prevoditelj";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/izracun-cijene/", req.url), 303);
  res.cookies.delete(KOLACIC);
  return res;
}

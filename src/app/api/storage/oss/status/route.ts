import { getOssConfig } from "@/lib/oss-server";

export const runtime = "nodejs";

export async function GET() {
  const config = getOssConfig();
  return Response.json({ configured: config.configured, bucket: config.bucket ?? "", region: config.region ?? "" });
}

import { getOssClient } from "@/lib/oss-server";

export const runtime = "nodejs";

const MANIFEST_KEY = "workbench/manifest.json";

export async function GET() {
  try {
    const client = getOssClient();
    try {
      const result = await client.get(MANIFEST_KEY);
      const content = Buffer.isBuffer(result.content) ? result.content.toString("utf8") : String(result.content ?? "{}");
      return new Response(content, { headers: { "Content-Type": "application/json; charset=utf-8" } });
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? (error as { status?: number }).status : 0;
      if (status === 404) return Response.json({ version: 1, updatedAt: Date.now(), files: [] });
      throw error;
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取 OSS 索引失败" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const manifest = await request.json();
    const client = getOssClient();
    await client.put(MANIFEST_KEY, Buffer.from(JSON.stringify({ ...manifest, updatedAt: Date.now() }, null, 2), "utf8"), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
    return Response.json({ ok: true, objectKey: MANIFEST_KEY, updatedAt: Date.now() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存 OSS 索引失败" }, { status: 400 });
  }
}

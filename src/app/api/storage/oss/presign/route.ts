import { getOssClient, normalizeObjectKey } from "@/lib/oss-server";

export const runtime = "nodejs";

type PresignBody = { method?: "PUT" | "GET"; objectKey?: string; contentType?: string };

export async function POST(request: Request) {
  try {
    const body = await request.json() as PresignBody;
    const method = body.method === "GET" ? "GET" : "PUT";
    const objectKey = normalizeObjectKey(body.objectKey ?? "");
    const contentType = body.contentType?.trim() || "application/octet-stream";
    const client = getOssClient();
    const options = method === "PUT" ? { headers: { "Content-Type": contentType } } : undefined;
    const url = await client.signatureUrlV4(method, 900, options, objectKey);
    return Response.json({ url, objectKey, expiresIn: 900, contentType });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "生成 OSS 签名失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { objectKeys?: string[] };
    const objectKeys = (body.objectKeys ?? []).map(normalizeObjectKey);
    if (!objectKeys.length) return Response.json({ deleted: 0 });
    const client = getOssClient();
    if (objectKeys.length === 1) await client.delete(objectKeys[0]);
    else await client.deleteMulti(objectKeys, { quiet: true });
    return Response.json({ deleted: objectKeys.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "删除 OSS 文件失败" }, { status: 400 });
  }
}

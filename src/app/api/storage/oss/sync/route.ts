import { createHash } from "node:crypto";
import { getOssClient, normalizeObjectKey } from "@/lib/oss-server";

export const runtime = "nodejs";

const MAX_SYNC_SIZE = 25 * 1024 * 1024;
const MANIFEST_KEY = "workbench/manifest.json";

function checksum(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export async function PUT(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const fileId = String(form.get("fileId") ?? "").trim();
    const objectKey = normalizeObjectKey(String(form.get("objectKey") ?? ""));
    const contentType = String(form.get("contentType") ?? "application/octet-stream").trim() || "application/octet-stream";
    const entryJson = String(form.get("entry") ?? "").trim();

    if (!(file instanceof File)) throw new Error("缺少需要同步的文件内容");
    if (!fileId || !/^[a-zA-Z0-9-]{8,}$/.test(fileId)) throw new Error("文件 ID 无效");
    if (!objectKey.startsWith("workbench/files/")) throw new Error("只允许同步工作台文件路径");
    if (file.size > MAX_SYNC_SIZE) throw new Error("单个同步文件不能超过 25 MB");

    const uploaded = Buffer.from(await file.arrayBuffer());
    const expectedSha256 = checksum(uploaded);
    const client = getOssClient();
    const result = await client.put(objectKey, uploaded, { headers: { "Content-Type": contentType } });
    const downloaded = await client.get(objectKey);
    const verified = Buffer.isBuffer(downloaded.content) ? downloaded.content : Buffer.from(downloaded.content);
    const actualSha256 = checksum(verified);

    if (verified.byteLength !== uploaded.byteLength || actualSha256 !== expectedSha256) {
      throw new Error("OSS 回读校验失败，云端内容与工作台保存内容不一致");
    }

    const responseHeaders = result.res.headers as Record<string, string | string[] | undefined>;
    const etag = String(responseHeaders.etag ?? "").replaceAll('"', "");
    const syncedAt = Date.now();
    let manifestUpdated = false;
    if (entryJson) {
      const entry = JSON.parse(entryJson) as Record<string, unknown>;
      if (entry.id !== fileId) throw new Error("文件索引与文件 ID 不一致");
      let files: Array<Record<string, unknown>> = [];
      try {
        const existing = await client.get(MANIFEST_KEY);
        const content = Buffer.isBuffer(existing.content) ? existing.content.toString("utf8") : String(existing.content ?? "{}");
        const manifest = JSON.parse(content) as { files?: Array<Record<string, unknown>> };
        files = Array.isArray(manifest.files) ? manifest.files : [];
      } catch (error) {
        const status = typeof error === "object" && error && "status" in error ? (error as { status?: number }).status : 0;
        if (status !== 404) throw error;
      }
      const syncedEntry = { ...entry, cloudObjectKey: objectKey, originalCloudObjectKey: undefined, size: verified.byteLength, storageState: "synced", cloudEtag: etag, cloudSha256: actualSha256, cloudSyncedAt: syncedAt, modifiedAt: syncedAt };
      const index = files.findIndex((candidate) => candidate.id === fileId);
      if (index >= 0) files[index] = syncedEntry;
      else files.push(syncedEntry);
      await client.put(MANIFEST_KEY, Buffer.from(JSON.stringify({ version: 1, updatedAt: syncedAt, files }, null, 2), "utf8"), { headers: { "Content-Type": "application/json; charset=utf-8" } });
      manifestUpdated = true;
    }

    return Response.json({
      objectKey,
      size: verified.byteLength,
      etag,
      sha256: actualSha256,
      syncedAt,
      verified: true,
      manifestUpdated,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "OSS 强一致同步失败" }, { status: 400 });
  }
}

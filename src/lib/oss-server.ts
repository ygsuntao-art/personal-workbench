import "server-only";
import OSS from "ali-oss";

export function getOssConfig() {
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  return { region, bucket, accessKeyId, accessKeySecret, configured: Boolean(region && bucket && accessKeyId && accessKeySecret) };
}
export function getOssClient() {
  const config = getOssConfig();
  if (!config.configured) throw new Error("OSS 尚未配置，请先填写 .env.local");
  return new OSS({
    region: config.region!,
    bucket: config.bucket!,
    accessKeyId: config.accessKeyId!,
    accessKeySecret: config.accessKeySecret!,
    secure: true,
    authorizationV4: true,
  });
}

export function normalizeObjectKey(value: string) {
  const key = value.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!key || key.length > 1023 || key.includes("../") || key.includes("\0")) throw new Error("对象路径无效");
  return key;
}

const fs = require("fs");
const path = require("path");
const OSS = require("ali-oss");

function loadEnv(file) {
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

async function main() {
  loadEnv(".env.local");
  const zip = process.argv[2];
  if (!zip) throw new Error("Missing zip path");

  const client = new OSS({
    region: process.env.ALIYUN_OSS_REGION,
    bucket: process.env.ALIYUN_OSS_BUCKET,
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    secure: true,
    timeout: 300000,
  });

  const objectKey = "deploy/workbench/" + path.basename(zip);
  await client.put(objectKey, zip);
  console.log(client.signatureUrl(objectKey, { expires: 3600, method: "GET" }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

# 阿里云 OSS 存储接入规格

## 目标

- 文件库中的普通文件与内部文档、表格、TXT 均可保存到私有 OSS Bucket。
- 浏览器不持有 AccessKey；由 Next.js 服务端生成短时 V4 签名 URL，浏览器直传 OSS。
- 本地 IndexedDB 继续作为编辑缓存，OSS 作为云端持久副本。

## 数据流

1. 客户端将文件或内部文档序列化为 Blob。
2. 客户端向 `/api/storage/oss/presign` 提交对象键、Content-Type。
3. 服务端使用仅限目标 Bucket 的 RAM 凭据生成 15 分钟 PUT 签名 URL。
4. 客户端 PUT 到 OSS，并保存 objectKey、ETag、同步时间和云端状态。
5. 打开只有云端副本的文件时，客户端申请 GET 签名 URL。

## 安全与费用

- Bucket：私有、阻止公共访问、标准存储、本地冗余、关闭传输加速。
- AccessKey 只写入 `.env.local`，不提交 Git。
- CORS 仅允许本地开发地址和正式域名，方法为 GET/HEAD/PUT，暴露 ETag。
- MVP 使用单次 PUT；后续桌面端大文件改为分片上传与断点续传。

## 验收

- 未配置密钥时页面明确显示“OSS 未配置”，不会误报成功。
- 配置后可生成 PUT/GET 签名地址。
- 文件上传成功后状态显示“本地 + 云端”。
- lint、build 与浏览器页面验证通过。

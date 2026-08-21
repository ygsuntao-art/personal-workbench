import WordExtractor from "word-extractor";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "没有收到Word文件" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: "Word文件不能超过20 MB" }, { status: 413 });
    const extractor = new WordExtractor();
    const document = await extractor.extract(Buffer.from(await file.arrayBuffer()));
    const body = document.getBody().replace(/\u0000/g, "").trim();
    return Response.json({ text: body || "文档中没有可提取的文字内容" });
  } catch {
    return Response.json({ error: "无法解析此Word文档，可能是受密码保护或格式已损坏" }, { status: 422 });
  }
}

/**
 * 文本解码：大陆用户的 txt / csv 大量是 GBK／GB18030，直接按 UTF-8 读会整篇变成「�」。
 * 先按 UTF-8 解，出现替换字符就回退到 GB18030（浏览器原生支持，无需额外依赖）。
 */
export async function decodeText(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    const gb = new TextDecoder('gb18030').decode(buf);
    // GB18030 几乎不会解码失败，用替换字符数量判断哪个结果更可信。
    return (gb.match(/\uFFFD/g)?.length ?? 0) < (utf8.match(/\uFFFD/g)?.length ?? 0) ? gb : utf8;
  } catch {
    return utf8;
  }
}

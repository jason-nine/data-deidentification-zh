// Generates the scenario example files under examples/ (see examples/README.md).
// Run: npm run examples
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { PDFDocument } from 'pdf-lib';
import { buildXlsx } from '../tests/helpers/xlsx-builder.ts';
import { contract, customers, meetingNotes, quotation, supportEmail } from './lib/documents.ts';
import { renderDocx } from './lib/render-docx.ts';
import { renderPdf } from './lib/render-pdf.ts';
import { renderScanPdf } from './lib/render-scan.ts';
import { scanPages } from './lib/scan-pages.ts';
import { detect } from '../src/core/detector.ts';
import { BUILTIN_PATTERNS } from '../src/core/patterns.ts';
import { applyRedactions } from '../src/core/redactor.ts';
import { serializeMapping } from '../src/core/csv.ts';
import { parseDocx, generateDocx } from '../src/formats/docx.ts';

// The docx pipeline needs a DOM; borrow jsdom's for this script.
const dom = new JSDOM('');
Object.assign(globalThis, { DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer });

const ROOT = 'examples';
// Keep the hand-written index when regenerating the scenario files.
const keptReadme = (() => {
  try {
    return readFileSync(join(ROOT, 'README.md'), 'utf-8');
  } catch {
    return null;
  }
})();
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
if (keptReadme !== null) writeFileSync(join(ROOT, 'README.md'), keptReadme);
const dir = (name: string) => {
  const p = join(ROOT, name);
  mkdirSync(p, { recursive: true });
  return p;
};
const write = (p: string, data: string | Uint8Array) => writeFileSync(p, data);
const font = new Uint8Array(readFileSync('public/fonts/NotoSansSC-Regular.ttf'));

// 情境 1：核心流程 — 真实案例（合同书 / 报价单 Word+PDF 各 3–4 页、客户数据 Excel 60 笔、信件、会议记录、5 页扫描文件）
const contractDoc = contract();
const quotationDoc = quotation();
const contractDocx = await renderDocx(contractDoc);
// 图片型（扫描）PDF：5 页模拟扫描影像，无文字层（需本机 Chrome）；同时输出对答案用的原稿（npm run eval:ocr）
const ANSWER_NOTE =
  '扫描样本的原稿：与页面影像同一份 HTML 产生，座标为 PDF 点（原点左下、转正后的页面）。text 为各页实际文字；planted／handwritten 为应被检测的印刷／手写敏感值；manual 为内建规则范围外、需手动新增的值；pictures 为不含文字、应保留的图片；rules／fills／checkboxes 为表格线条、底色与勾选框。';
const scanned = scanPages();
const { pdf: scannedPdf, truth: scannedTruth } = await renderScanPdf(scanned);
const answerKey = (source: string, pages: typeof scanned, truth: typeof scannedTruth) =>
  JSON.stringify({ source, note: ANSWER_NOTE, pages: pages.map((p, i) => ({ title: p.title, planted: p.planted, handwritten: p.handwritten, manual: p.manual, ...truth[i] })) }, null, 2) + '\n';
write('tests/fixtures/scanned-sample.answer.json', answerKey('public/samples/scanned.pdf', scanned, scannedTruth));
// 评分用的角度样本（不放上网站）：信函与表单倾斜 3°／6°，信函转向 90°／180°
{
  const [letterPage, formPage] = scanned;
  const angled: typeof scanned = [
    { ...letterPage, tilt: 3 },
    { ...letterPage, tilt: 6 },
    { ...formPage, tilt: 3 },
    { ...formPage, tilt: 6 },
    { ...letterPage, rotate: 90 },
    { ...letterPage, rotate: 180 },
  ];
  const { pdf, truth } = await renderScanPdf(angled);
  write('tests/fixtures/scan-angles.pdf', pdf);
  write('tests/fixtures/scan-angles.answer.json', answerKey('tests/fixtures/scan-angles.pdf', angled, truth));
}
{
  const d = dir('01-核心流程');
  write(join(d, '外包服务合同书.docx'), contractDocx);
  write(join(d, '外包服务合同书.pdf'), await renderPdf(contractDoc, font));
  write(join(d, '报价单.docx'), await renderDocx(quotationDoc));
  write(join(d, '报价单.pdf'), await renderPdf(quotationDoc, font));
  write(join(d, '客户数据.xlsx'), await buildXlsx(customers()));
  write(join(d, '客服邮件.txt'), supportEmail());
  write(join(d, '项目会议记录.md'), meetingNotes());
  write(join(d, '扫描文件.pdf'), scannedPdf);
}

// 情境 2：人工调整 — 含误判（高铁站）与漏抓（罕见姓氏、病历号）
{
  const d = dir('02-人工调整');
  write(
    join(d, '人工调整示例.txt'),
    `访视记录

案主禚小华（病历号 MRN-2024-00123）于上午抵达高铁站的服务台，由社工王小明接待。
案主联络手机 0933-111-222，居住于高雄市苓雅区四维三路2号。

【操作提示】
1. 「高铁站」会被姓名规则误判 → 在右侧清单按「取消」。
2. 「禚小华」因姓氏罕见未被检测 → 在预览中框选后选择类别「姓名」新增。
3. 「MRN-2024-00123」为病历号 → 框选后选择类别「标识符」新增（或到「检测规则」新增自定义规则 MRN-\\d{4}-\\d{5}）。
`,
  );
}

// 情境 3：还原 — 由实际管线产出的成对文件（Word 合同书 + 客服邮件），外加缺列与格式错误的 CSV
{
  const d = dir('03-还原');
  const file = new File([contractDocx as BlobPart], '外包服务合同书.docx');
  const doc = await parseDocx(file);
  const items = detect(doc.text, BUILTIN_PATTERNS);
  const { edits, mapping } = applyRedactions(doc.text, items);
  const blob = await generateDocx(doc, edits);
  write(join(d, '外包服务合同书.deid.docx'), new Uint8Array(await blob.arrayBuffer()));
  write(join(d, '外包服务合同书.mapping.csv'), serializeMapping(mapping));
  write(join(d, '外包服务合同书.mapping.缺一列.csv'), serializeMapping(mapping.slice(1)));
  write(join(d, '格式错误.mapping.csv'), '﻿code,original\r\n' + mapping.map((m) => `${m.code},${m.original}`).join('\r\n') + '\r\n');
  write(join(d, '编码重复.mapping.csv'), serializeMapping([...mapping, mapping[0]]));

  const mail = supportEmail();
  const mailItems = detect(mail, BUILTIN_PATTERNS);
  const mailRes = applyRedactions(mail, mailItems);
  write(join(d, '客服邮件.deid.txt'), mailRes.redactedText);
  write(join(d, '客服邮件.mapping.csv'), serializeMapping(mailRes.mapping));
}

// 情境 4：检测规则 — 自定义标识符（客户编号、统一社会信用代码、病历号）与停用手机规则
{
  const d = dir('04-检测规则');
  write(
    join(d, '自定义规则示例.txt'),
    `人事异动通知

承办人员 EMP-004521（陈大文）已于 2026-09-01 到职，联络手机 0912-345-678。
备援人员 EMP-000132（林美玲），联络手机 0987-654-321。
病历号 MRN-2024-00123 与 MRN-2025-00456 之案件移交完成。
客户 CUST-10008（统一社会信用代码 04595257，嘉宏信息股份有限公司）之合约已归档。

【操作提示】
1. 先直接上传：手机、统一社会信用代码、公司名称会被内建规则检测；EMP-/MRN-/CUST- 编号不会。
2. 到「检测规则」停用「手机号码」，并新增自定义规则（类别皆为「标识符」）：
   - 员工编号　EMP-\\d{6}
   - 病历号　　MRN-\\d{4}-\\d{5}
   - 客户编号　CUST-\\d{5}
3. 回到「去标识化」按「重新检测」：编号被标记、手机不再被标记。
4. 用同样的规则处理 01-核心流程/客户数据.xlsx，可看到「客户编号」整栏被标记（「统一社会信用代码」与「公司」字段本来就会被内建规则标记）。
5. 重新整理页面，规则设置仍保留。
`,
  );
}

// 情境 6：格式与边界
{
  const d = dir('06-格式与边界');
  const blank = await PDFDocument.create();
  blank.addPage([595, 842]);
  write(join(d, '空白页无文字.pdf'), await blank.save());
  write(join(d, '不支持的格式.json'), '{ "name": "王小明", "id": "A123456789" }\n');
  write(
    join(d, '原文含标记样式.txt'),
    `本合同第 3 条引用之模板编号为 [姓名:abcdef]，此为原文既有文字，非去标识化标记。
签署人：王小明（0912-345-678）
`,
  );
  write(
    join(d, '如何产生超大文件.md'),
    `# 超过 100 MB 上限的测试档

文件太大不放进版本库，请自行产生：

\`\`\`bash
# macOS / Linux：产生 101 MB 的文字档
head -c 105906176 /dev/zero | tr '\\0' 'A' > 超过上限.txt
\`\`\`

上传后预期出现「文件超过 100 MB 上限」的警告视窗，需按「我知道了」关闭，该档不会加载；同时选择的其他文件照常处理。
`,
  );
}

// 网页与 README 的「体验示例」：同一批文件以 ASCII 档名放进 public/samples/（随站台部署）
{
  const d = 'public/samples';
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
  write(join(d, 'contract.docx'), contractDocx);
  write(join(d, 'contract.pdf'), await renderPdf(contractDoc, font));
  write(join(d, 'quotation.docx'), await renderDocx(quotationDoc));
  write(join(d, 'quotation.pdf'), await renderPdf(quotationDoc, font));
  write(join(d, 'customers.xlsx'), await buildXlsx(customers()));
  write(join(d, 'support-email.txt'), supportEmail());
  write(join(d, 'meeting-notes.md'), meetingNotes());
  write(join(d, 'scanned.pdf'), scannedPdf);
  const file = new File([contractDocx as BlobPart], '外包服务合同书.docx');
  const doc = await parseDocx(file);
  const items = detect(doc.text, BUILTIN_PATTERNS);
  const { edits, mapping } = applyRedactions(doc.text, items);
  write(join(d, 'contract.deid.docx'), new Uint8Array(await (await generateDocx(doc, edits)).arrayBuffer()));
  write(join(d, 'contract.mapping.csv'), serializeMapping(mapping));
}

console.log('examples written under', ROOT, 'and public/samples');

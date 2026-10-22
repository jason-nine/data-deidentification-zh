import type { DocFormat, LoadedDocument, TextEdit } from '../core/types';
import { MAX_FILE_BYTES } from '../core/types';
import { generatePlainText, parsePlainText } from './plaintext';
import type { ParsePdfOptions } from './pdf';

export const SUPPORTED_EXTENSIONS: Record<string, DocFormat> = {
  txt: 'txt',
  md: 'md',
  markdown: 'md',
  docx: 'docx',
  xlsx: 'xlsx',
  pdf: 'pdf',
};

export const ACCEPT_ATTR = '.txt,.md,.markdown,.docx,.xlsx,.pdf';

export function detectFormat(fileName: string): DocFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_EXTENSIONS[ext] ?? null;
}

export function validateFile(file: File): DocFormat {
  const format = detectFormat(file.name);
  if (!format) throw new Error('不支持的文件格式，请上传 PDF、Word (.docx)、Excel (.xlsx)、TXT 或 Markdown');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`文件超过 ${MAX_FILE_BYTES / 1024 / 1024} MB 上限`);
  }
  return format;
}

/** `ocr` lets an image-only (scanned) PDF be recognised instead of rejected. */
export async function parseDocument(file: File, opts: ParsePdfOptions = {}): Promise<LoadedDocument> {
  const format = validateFile(file);
  switch (format) {
    case 'txt':
    case 'md':
      return parsePlainText(file, format);
    case 'docx':
      return (await import('./docx')).parseDocx(file);
    case 'xlsx':
      return (await import('./xlsx')).parseXlsx(file);
    case 'pdf':
      return (await import('./pdf')).parsePdf(file, opts);
  }
}

export async function generateDocument(doc: LoadedDocument, edits: TextEdit[]): Promise<Blob> {
  switch (doc.format) {
    case 'txt':
    case 'md':
      return generatePlainText(doc, edits);
    case 'docx':
      return (await import('./docx')).generateDocx(doc, edits);
    case 'xlsx':
      return (await import('./xlsx')).generateXlsx(doc, edits);
    case 'pdf':
      return (await import('./pdf')).generatePdf(doc, edits);
  }
}

export function outputFileName(original: string, suffix: string): string {
  const dot = original.lastIndexOf('.');
  if (dot <= 0) return `${original}.${suffix}`;
  return `${original.slice(0, dot)}.${suffix}${original.slice(dot)}`;
}

export function mappingFileName(original: string): string {
  const dot = original.lastIndexOf('.');
  const base = dot <= 0 ? original : original.slice(0, dot);
  return `${base}.mapping.csv`;
}

export function formatLimitations(format: DocFormat, ocr = false): string | null {
  if (format === 'pdf' && ocr) {
    return '此文件为扫描影像，文字由浏览器内的文字识别（OCR）取得，可能有误认或遗漏，请逐页核对预览并手动补上漏抓的项目。输出只含识别出的文字（依原位置重绘）与不含文字的图片（照片、标志，可在预览逐张取消保留），其余页面影像一律不保留；未识别出的文字不会出现在输出中。还原时只还原文字。';
  }
  if (format === 'pdf') {
    return 'PDF 输出为文字版面重建：文字依原座标绘回，但图片、图形与原字型不会保留。此做法确保输出文件内不残留任何原始敏感文字。';
  }
  if (format === 'xlsx') {
    return 'Excel 输出保留单元格样式与工作表结构；仅处理文字型单元格，以数值保存的电话／证号、公式结果、工作表名称与注解不在检测范围。';
  }
  if (format === 'docx') {
    return 'Word 输出保留原有样式与表格；文字方块、注解等特殊区域可能未涵盖，请以预览为准。';
  }
  return null;
}

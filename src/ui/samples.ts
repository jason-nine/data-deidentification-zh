import { button, el, toast, withBusy } from './components';

export interface Sample {
  file: string;
  /** Display / download name (Chinese) for the ASCII-named asset. */
  name: string;
  format: string;
  description: string;
}

const BASE = `${import.meta.env.BASE_URL}samples/`;

/** One sample per format, shown as a single compact row on the upload screen. */
export const SAMPLES: Sample[] = [
  { file: 'contract.docx', name: '外包服务合同书.docx', format: 'Word', description: '4 页合同，含表格与页眉页脚' },
  { file: 'quotation.pdf', name: '报价单.pdf', format: 'PDF', description: '3 页报价单，跨页明细表' },
  { file: 'scanned.pdf', name: '扫描文件.pdf', format: '扫描 PDF', description: '5 页影像需识别，含手写与表格' },
  { file: 'customers.xlsx', name: '客户数据.xlsx', format: 'Excel', description: '60 条客户，三个工作表' },
  { file: 'meeting-notes.md', name: '项目会议记录.md', format: 'Markdown', description: '出席者、决议、待办' },
];

export const RESTORE_SAMPLE = {
  doc: { file: 'contract.deid.docx', name: '外包服务合同书.deid.docx', format: 'DOCX', description: '已去标识化的合同书' },
  csv: { file: 'contract.mapping.csv', name: '外包服务合同书.mapping.csv', format: 'CSV', description: '对应的编码表' },
};

export function sampleUrl(file: string): string {
  return BASE + file;
}

/** Fetches a bundled sample (same-origin static asset) as a File carrying its display name. */
export async function fetchSample(s: Pick<Sample, 'file' | 'name'>): Promise<File> {
  const res = await fetch(sampleUrl(s.file));
  if (!res.ok) throw new Error(`无法加载示例 ${s.name}`);
  return new File([await res.blob()], s.name);
}

export function sampleCard(s: Sample, onLoad?: (file: File) => void | Promise<void>): HTMLElement {
  return el(
    'div',
    { class: 'sample-card' },
    el('div', { class: 'sample-main' },
      el('div', { class: 'sample-name' }, el('span', { class: 'badge' }, s.format), ' ', s.name),
      el('div', { class: 'muted small' }, s.description),
    ),
    el('div', { class: 'sample-actions' },
      onLoad
        ? button('加载', () => {
            withBusy('加载示例中…', () => fetchSample(s).then((file) => onLoad(file))).catch((e: Error) => toast(e.message, 'error'));
          }, 'btn btn-small btn-primary')
        : null,
      el('a', { class: 'btn btn-small', href: sampleUrl(s.file), download: s.name }, '下载'),
    ),
  );
}

export function samplesSection(title: string, samples: Sample[], onLoad?: (file: File) => void | Promise<void>, extra?: Node): HTMLElement {
  return el(
    'section',
    { class: 'samples' },
    el('div', { class: 'samples-head' },
      el('h3', {}, title),
      el('span', { class: 'muted small' }, '均为程序产生的虚构数据；「加载」直接送进本页处理，「下载」取得原始文件'),
    ),
    el('div', { class: 'sample-row' }, ...samples.map((s) => sampleCard(s, onLoad))),
    extra ?? null,
  );
}

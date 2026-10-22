import type { LoadedDocument, MappingEntry } from '../core/types';
import { parseMarkers } from '../core/codes';
import { parseMapping } from '../core/csv';
import { decodeText } from '../formats/encoding';
import { restore, type RestoreResult } from '../core/restorer';
import { ACCEPT_ATTR, generateDocument, outputFileName, parseDocument } from '../formats';
import { button, clear, downloadBlob, dropZone, el, rejectOversized, toast, withBusy } from './components';
import { renderDocumentPreview, type Decoration } from './preview';
import { RESTORE_SAMPLE, fetchSample, sampleUrl } from './samples';

interface State {
  doc: LoadedDocument | null;
  mapping: MappingEntry[] | null;
  result: RestoreResult | null;
}

const state: State = { doc: null, mapping: null, result: null };

export function createRestoreView(): HTMLElement {
  const root = el('section', { class: 'view restore-view' });
  render(root);
  return root;
}

function render(root: HTMLElement): void {
  clear(root);
  root.append(
    el('h2', {}, '还原文件'),
    el('p', { class: 'muted' }, '上传去标识化后的文件与对应的编码表 (CSV)，系统会将 [类别:编码] 标记换回原始内容。'),
    el('div', { class: 'restore-inputs' },
      el('div', { class: 'restore-slot' },
        el('h3', {}, '1. 去标识化文件'),
        state.doc ? fileChip(state.doc.fileName, () => { state.doc = null; state.result = null; render(root); }) : dropZone({ accept: ACCEPT_ATTR, label: '选择去标识化文件', hint: '.pdf .docx .xlsx .txt .md', onFiles: (f) => void loadDocChecked(f[0], root) }),
      ),
      el('div', { class: 'restore-slot' },
        el('h3', {}, '2. 编码表 (CSV)'),
        state.mapping ? fileChip(`编码表：${state.mapping.length} 笔`, () => { state.mapping = null; state.result = null; render(root); }) : dropZone({ accept: '.csv,text/csv', label: '选择编码表 CSV', hint: '*.mapping.csv', onFiles: (f) => void loadCsv(f[0], root) }),
      ),
    ),
  );
  if (state.result) root.append(renderResult(root));
  else {
    root.append(
      el('section', { class: 'samples' },
        el('h3', {}, '用示例体验还原'),
        el('p', { class: 'muted small' }, '示例为已去标识化的 4 页合同书与其编码表（虚构数据）。「加载体验」会同时加载两个文件并自动还原。'),
        el('div', { class: 'sample-actions' },
          button('加载体验', () => void withBusy('加载示例中…', () => loadSamplePair(root)), 'btn btn-small btn-primary'),
          el('a', { class: 'btn btn-small', href: sampleUrl(RESTORE_SAMPLE.doc.file), download: RESTORE_SAMPLE.doc.name }, `下载 ${RESTORE_SAMPLE.doc.name}`),
          el('a', { class: 'btn btn-small', href: sampleUrl(RESTORE_SAMPLE.csv.file), download: RESTORE_SAMPLE.csv.name }, `下载 ${RESTORE_SAMPLE.csv.name}`),
        ),
      ),
    );
  }
}

async function loadSamplePair(root: HTMLElement): Promise<void> {
  try {
    const [doc, csv] = await Promise.all([fetchSample(RESTORE_SAMPLE.doc), fetchSample(RESTORE_SAMPLE.csv)]);
    state.doc = await parseDocument(doc);
    const { entries, errors } = parseMapping(await decodeText(csv));
    if (errors.length) throw new Error(errors[0]);
    state.mapping = entries;
    state.result = null;
    tryRestore();
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

function fileChip(label: string, onRemove: () => void): HTMLElement {
  return el('div', { class: 'file-chip' }, el('span', {}, label), button('移除', onRemove, 'btn btn-small btn-ghost'));
}

async function loadDocChecked(file: File, root: HTMLElement): Promise<void> {
  if ((await rejectOversized([file])).length > 0) await withBusy('读取文件中…', () => loadDoc(file, root));
}

/** Output written with 类别 or 空白占位 carries no codes, so there is nothing to restore. */
const NO_MARKERS = '这份文件里找不到编码标记；若去标识化时标记方式选了「类别」或「空白占位」，就无法还原。';

async function loadDoc(file: File, root: HTMLElement): Promise<void> {
  try {
    state.doc = await parseDocument(file);
    if (!state.mapping && parseMarkers(state.doc.text).length === 0) toast(NO_MARKERS, 'error', 8000);
    state.result = null;
    tryRestore();
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

async function loadCsv(file: File, root: HTMLElement): Promise<void> {
  try {
    const { entries, errors } = parseMapping(await decodeText(file));
    if (errors.length) {
      toast(`编码表格式错误：${errors.slice(0, 3).join('；')}${errors.length > 3 ? '…' : ''}`, 'error', 9000);
      return;
    }
    state.mapping = entries;
    state.result = null;
    tryRestore();
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

function tryRestore(): void {
  if (!state.doc || !state.mapping) return;
  state.result = restore(state.doc.text, state.mapping);
  if (state.result.missingCodes.length) toast(`有 ${state.result.missingCodes.length} 个编码在编码表中找不到`, 'error', 7000);
  else if (state.result.restoredCount === 0) toast(NO_MARKERS, 'error', 8000);
  else toast(`已还原 ${state.result.restoredCount} 笔`, 'success');
}

function renderResult(root: HTMLElement): HTMLElement {
  const r = state.result!;
  const doc = state.doc!;
  const preview = el('div', { class: 'preview' });
  const decorations: Decoration[] = r.edits.map((e) => ({
    start: e.start,
    end: e.end,
    kind: 'restored',
    label: e.replacement,
    className: 'mark-restored',
    tip: `已由标记 ${doc.text.slice(e.start, e.end)} 还原`,
  }));
  renderDocumentPreview(preview, doc, decorations);

  return el(
    'div',
    { class: 'restore-result' },
    el('div', { class: 'toolbar' },
      el('div', {}, el('strong', {}, `已还原 ${r.restoredCount} 笔`), r.missingCodes.length ? el('span', { class: 'warn' }, `，${r.missingCodes.length} 个编码无法还原`) : null),
      button('下载还原文件', () => void download(root), 'btn btn-primary'),
    ),
    r.missingCodes.length
      ? el('div', { class: 'notice notice-warn' }, '以下编码在编码表中找不到，已保留原标记：', el('div', { class: 'code-list' }, ...r.missingCodes.map((c) => el('code', {}, c))))
      : null,
    el('h3', {}, '还原预览'),
    preview,
  );
}

async function download(_root: HTMLElement): Promise<void> {
  const doc = state.doc!;
  const r = state.result!;
  try {
    toast('产生文件中…', 'info', 2000);
    const blob = await generateDocument(doc, r.edits);
    downloadBlob(blob, outputFileName(doc.fileName.replace(/\.deid(?=\.[^.]+$)/, ''), 'restored'));
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

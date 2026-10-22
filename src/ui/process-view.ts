import type { Category, LoadedDocument, MappingEntry, RedactionItem, Retention } from '../core/types';
import { CATEGORIES, MAX_FILE_BYTES } from '../core/types';
import { addManualItem, detect, resplitItems, toggleItem } from '../core/detector';
import { applyRedactions, blankOut, isPartial, mergeMappings, outputFor, previewLabel, type MarkerStyle } from '../core/redactor';
import { CodeBook, parseMarkers } from '../core/codes';
import { parseMapping, serializeMapping } from '../core/csv';
import { decodeText } from '../formats/encoding';
import { getEffectivePatterns, loadConfig, saveConfig, setCategoryRetention } from '../core/pattern-store';
import { MODE_LABELS, checkRetention, describeRetention, modesFor, splitFor, type RetentionMode } from '../core/retention';
import { ACCEPT_ATTR, formatLimitations, generateDocument, mappingFileName, outputFileName, parseDocument } from '../formats';
import { button, clear, downloadBlob, dropZone, el, rejectOversized, toast, withBusy } from './components';
import { renderDocumentPreview, type Decoration } from './preview';
import { MERGED_MAPPING_NAME, buildArchive } from '../formats/batch';
import { SAMPLES, samplesSection } from './samples';
import { ocrOverlay } from './ocr-overlay';

export const MAX_FILES = 10;

/** 部分保留 (default) keeps the standard statistics-friendly characters; 全部隐藏 hides every value; 自定义 is set per category. */
type OutputMode = 'code' | 'preview' | 'custom';
const OUTPUT_MODE_LABELS: Record<OutputMode, string> = { preview: '部分保留', code: '全部隐藏', custom: '自定义' };

/** 编码 restores with the mapping table; 类别 and 空白占位 are for output that is never restored. */
const MARKER_LABELS: Record<MarkerStyle, string> = { code: '编码', label: '类别', blank: '空白占位' };
const MARKER_NOTES: Record<MarkerStyle, [string, string]> = {
  code: ['[姓名:6e679d]', '可还原，附编码表'],
  label: ['[姓名]', '不需还原'],
  blank: ['○○○', '不需还原，保留原本的字数'],
};

/** Monospace fonts draw ○ as a small o: examples written with ○ use the text font. */
const exampleClass = (cls: string, marker: MarkerStyle = state.marker): string => (marker === 'blank' ? cls : `mono ${cls}`);

/** What an ID number becomes under an output mode and marker style (codes show as [类别], as in the preview). */
function modeExample(mode: OutputMode, marker: MarkerStyle): string {
  if (mode === 'custom') return '逐类别设置';
  const id = '110101199003078515';
  const kept = mode === 'preview' ? id.slice(0, 2) : '';
  const hidden = id.slice(kept.length);
  return `${id} → ${kept}${marker === 'blank' ? blankOut(hidden) : '[身份证]'}`;
}

/** One uploaded (or pasted) document and everything the user has done to it. */
interface DocState {
  doc: LoadedDocument;
  items: RedactionItem[];
  book: CodeBook;
  /** Bumped on every change that alters the output; downloads remember the version they were made from. */
  version: number;
  docVer: number;
  csvVer: number;
}

interface State {
  docs: DocState[];
  /** Index into `docs` of the document shown in the preview. */
  active: number;
  /** Ignore the document layout (Word/Excel/PDF) and preview as plain text. */
  plainView: boolean;
  /** Categories switched off in the category table (applies to every document). */
  disabledCategories: Set<Category>;
  /** The detection list is collapsed by default. */
  showList: boolean;
  /** The output settings panel is collapsed to a one-line summary by default. */
  panelOpen: boolean;
  /** Its 依类别调整 and 高级 sections, open for the session once opened (open anyway under 自定义). */
  categoriesOpen: boolean;
  advancedOpen: boolean;
  /** Every document shares one code book. */
  sharedCodes: boolean;
  /** Imported mapping table; its codes are reused for identical values. */
  imported: { fileName: string; entries: MappingEntry[] } | null;
  /** The batch-wide book while sharedCodes is on; created with the first document. */
  sharedBook: CodeBook | null;
  /** How much of each value stays visible in the output (applies to every document). */
  outputMode: OutputMode;
  /** How the hidden part is written; only 编码 can be restored (applies to every document). */
  marker: MarkerStyle;
  /** 自定义 mode: per-category retention overriding the rules' own setting. */
  overrides: Map<Category, Retention>;
  /** Fingerprint of the patterns the loaded documents were last detected with. */
  patternKey: string;
}

const state: State = {
  docs: [],
  active: 0,
  plainView: false,
  disabledCategories: new Set(),
  showList: false,
  panelOpen: false,
  categoriesOpen: false,
  advancedOpen: false,
  sharedCodes: false,
  imported: null,
  sharedBook: null,
  outputMode: 'preview',
  marker: 'code',
  overrides: new Map(),
  patternKey: '',
};

/** Retention of the first enabled rule of a category (the 自定义 default before any override). */
function ruleRetention(category: Category): Retention | undefined {
  const r = getEffectivePatterns().find((p) => p.enabled && p.category === category)?.retention;
  return r && r.mode !== 'none' ? r : undefined;
}

/** What an item keeps under the current output mode; manual items follow their category like detected ones. */
function effectiveRetention(it: RedactionItem): Retention | undefined {
  if (state.outputMode === 'code') return undefined;
  if (state.outputMode === 'preview') return { mode: 'preview' };
  return state.overrides.get(it.category) ?? it.retention;
}

function applyOutputMode(d: DocState): void {
  resplitItems(d.items, d.book, effectiveRetention);
}

function applyOutputModeToAll(): void {
  for (const d of state.docs) {
    applyOutputMode(d);
    markDirty(d);
  }
}

/** Seeded from the imported table when there is one; one book for the whole batch when codes are shared. */
function bookForNewDoc(): CodeBook {
  if (state.sharedCodes && state.sharedBook) return state.sharedBook;
  const book = new CodeBook();
  if (state.imported) book.seed(state.imported.entries);
  if (state.sharedCodes) state.sharedBook = book;
  return book;
}

/** Code scope changed mid-way: give every document a fresh book and reassign all codes. */
function rebuildBooks(): void {
  state.sharedBook = null;
  for (const d of state.docs) d.book = bookForNewDoc();
  applyOutputModeToAll();
}

const restorable = (): boolean => state.marker === 'code';

/** A batch-wide table is offered whenever codes can repeat across files or continue an earlier table. */
const hasMergedTable = (): boolean => restorable() && (state.sharedCodes || state.imported !== null);

function mergedMapping(): MappingEntry[] {
  return mergeMappings(state.imported?.entries ?? [], ...state.docs.map((d) => applyRedactions(d.doc.text, d.items).mapping));
}
/** The mounted view, so changes made in other tabs can re-render it. */
let viewRoot: HTMLElement | null = null;

const current = (): DocState => state.docs[state.active];

function markDirty(d: DocState): void {
  d.version++;
}

/** Without restoring there is no mapping table to download, only the document. */
const isDownloaded = (d: DocState): boolean => d.docVer === d.version && (!restorable() || d.csvVer === d.version);

function tooltipFor(it: RedactionItem): string {
  return `${it.category}｜原文：${it.original}｜输出标记：${outputFor(it, state.marker)}${it.origin === 'manual' ? '｜手动新增' : ''}`;
}

function setCategoryEnabled(category: Category, enabled: boolean): void {
  if (enabled) state.disabledCategories.delete(category);
  else state.disabledCategories.add(category);
  for (const d of state.docs) {
    for (const it of d.items) {
      if (it.category !== category || it.active === enabled) continue;
      try {
        toggleItem(d.items, it.id);
      } catch {
        // re-enabling an item that now overlaps a manual one: leave it cancelled
      }
    }
    markDirty(d);
  }
}

/** Newly detected items honour the categories switched off in the category table. */
function applyDisabledCategories(d: DocState): void {
  for (const it of d.items) if (state.disabledCategories.has(it.category)) it.active = false;
}

export function hasUnsavedResults(): boolean {
  return state.docs.some((d) => d.items.some((it) => it.active) && !isDownloaded(d));
}

export function createProcessView(): HTMLElement {
  const root = el('section', { class: 'view process-view' });
  viewRoot = root;
  state.patternKey = patternKey();
  render(root);
  return root;
}

function patternKey(): string {
  return JSON.stringify(getEffectivePatterns().filter((p) => p.enabled).map((p) => [p.id, p.category, p.regex]));
}

/**
 * Called when the tab becomes visible again: if detection rules changed in the meantime
 * (e.g. a rule added in「检测规则」), re-detect every loaded document, keeping manual items,
 * codes and the user's cancellations for matches that are still found.
 */
export function syncPatternChanges(): void {
  const key = patternKey();
  if (key === state.patternKey) return;
  state.patternKey = key;
  if (state.docs.length === 0 || !viewRoot) return;
  for (const d of state.docs) rescan(d, true);
  const total = state.docs.reduce((n, d) => n + d.items.length, 0);
  toast(`检测规则已变更，已重新检测（共 ${total} 笔）`, 'success');
  render(viewRoot);
}

// ---------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------
/** Parsing a PDF/Word file (and loading its parser) can take a while: lock the page and show progress meanwhile. */
async function loadFiles(files: File[], root: HTMLElement): Promise<void> {
  const accepted = await rejectOversized(files);
  if (accepted.length > 0) await withBusy('读取文件中…', () => importFiles(accepted, root));
}

async function importFiles(files: File[], root: HTMLElement): Promise<void> {
  const room = MAX_FILES - state.docs.length;
  if (files.length > room) {
    toast(`一次最多处理 ${MAX_FILES} 个文件（目前已有 ${state.docs.length} 个，只能再加入 ${room} 个）`, 'error', 7000);
    files = files.slice(0, Math.max(0, room));
    if (files.length === 0) return;
  }
  let loaded = 0;
  let firstNew = -1;
  for (const file of files) {
    try {
      const doc = await parseWithOcr(file);
      const book = bookForNewDoc();
      const d: DocState = { doc, items: detect(doc.text, getEffectivePatterns(), book), book, version: 0, docVer: -1, csvVer: -1 };
      applyOutputMode(d);
      applyDisabledCategories(d);
      state.docs.push(d);
      if (firstNew < 0) firstNew = state.docs.length - 1;
      loaded++;
      if (parseMarkers(doc.text).length > 0) {
        toast(`${file.name}：原文中已存在形如 [类别:编码] 的文字，可能与去标识化标记混淆。`, 'error', 8000);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') toast(`已取消识别「${file.name}」`, 'info');
      else toast(`${file.name}：${(e as Error).message}`, 'error', 7000);
    }
  }
  if (loaded === 0) return;
  state.active = firstNew;
  const total = state.docs.reduce((n, d) => n + d.items.length, 0);
  toast(loaded === 1 ? `检测到 ${current().items.length} 笔敏感信息` : `已加载 ${loaded} 个文件，共检测到 ${total} 笔敏感信息`, 'success');
  if (current().items.length === 0) toast('此文件未检测到敏感信息。你仍可在预览中框选文字手动新增。', 'info', 6000);
  render(root);
}

/** An image-only PDF is recognised behind its own progress screen, which can cancel it (FR-008, FR-009). */
async function parseWithOcr(file: File): Promise<LoadedDocument> {
  const abort = new AbortController();
  const overlay = ocrOverlay(file.name, () => abort.abort());
  try {
    return await parseDocument(file, { ocr: { signal: abort.signal, onProgress: (p) => overlay.update(p) } });
  } finally {
    overlay.close();
  }
}

/**
 * Re-runs detection on a document, keeping manual items. With `keep`, an automatic match
 * found again at the same place reuses its previous item (id, code, cancelled state).
 */
function rescan(d: DocState, keep: boolean): { auto: number; manual: number } {
  const manual = d.items.filter((it) => it.origin === 'manual');
  const old = new Map(d.items.filter((it) => it.origin === 'auto').map((it) => [`${it.start},${it.end},${it.category}`, it]));
  const fresh = detect(d.doc.text, getEffectivePatterns(), d.book)
    .filter((a) => !manual.some((m) => m.active && a.start < m.end && a.end > m.start))
    .map((a) => (keep && old.get(`${a.start},${a.end},${a.category}`)) || a);
  d.items = [...manual, ...fresh].sort((a, b) => a.start - b.start);
  applyOutputMode(d);
  applyDisabledCategories(d);
  markDirty(d);
  return { auto: fresh.length, manual: manual.length };
}

function redetect(root: HTMLElement): void {
  const { auto, manual } = rescan(current(), false);
  toast(`重新检测完成：自动 ${auto} 笔、手动 ${manual} 笔`, 'success');
  render(root);
}

function removeDoc(index: number, root: HTMLElement): void {
  const d = state.docs[index];
  if (d.items.some((it) => it.active) && !isDownloaded(d) && !confirm(`「${d.doc.fileName}」尚未下载去标识化结果${restorable() ? '与编码表' : ''}，确定要移除吗？`)) return;
  state.docs.splice(index, 1);
  state.active = Math.min(state.active, Math.max(0, state.docs.length - 1));
  render(root);
}

function resetAll(root: HTMLElement): void {
  if (hasUnsavedResults() && !confirm('尚有文件未下载去标识化结果与编码表，确定要全部清除吗？')) return;
  state.docs = [];
  state.active = 0;
  state.sharedBook = null;
  render(root);
}

// ---------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------
function render(root: HTMLElement): void {
  clear(root);
  if (state.docs.length === 0) {
    root.append(
      el('h2', {}, '上传文件'),
      el('p', { class: 'muted' }, `支持 PDF（含扫描件，会在浏览器内识别文字）、Word (.docx)、Excel (.xlsx)、TXT、Markdown；可一次选择多个文件（最多 ${MAX_FILES} 个、格式可混合），单档 ${MAX_FILE_BYTES / 1024 / 1024} MB 以内。所有处理均在浏览器内完成，文件不会离开你的电脑。`),
      dropZone({
        accept: ACCEPT_ATTR,
        multiple: true,
        label: '拖拽一个或多个文件到这里，或点击选择文件',
        hint: `.pdf .docx .xlsx .txt .md ・ 最多 ${MAX_FILES} 个`,
        onFiles: (files) => void loadFiles(files, root),
      }),
      renderPasteBox(root),
      el('details', { class: 'code-options', open: state.sharedCodes || state.imported !== null },
        el('summary', {}, '高级：跨文件共用编码'),
        renderCodeScope(root),
      ),
      samplesSection('没有文件？用示例体验', SAMPLES, (file) => loadFiles([file], root)),
    );
    return;
  }
  root.append(renderToolbar(root), renderWorkspace(root));
}

/**
 * Code scope (shared across the batch / continued from an imported table). Can be changed at any
 * time: once documents are loaded every code is reassigned and the files need downloading again.
 */
function renderCodeScope(root: HTMLElement): HTMLElement {
  const changed = (msg: string) => {
    if (state.docs.length) {
      rebuildBooks();
      toast(`${msg}；所有文件的编码已重新配置，请重新下载`, 'info', 5000);
    }
    render(root);
  };
  const shared = el('input', { type: 'checkbox' }) as HTMLInputElement;
  shared.checked = state.sharedCodes;
  shared.addEventListener('change', () => {
    state.sharedCodes = shared.checked;
    changed(shared.checked ? '已开启整批共用编码' : '已关闭整批共用编码');
  });
  const input = el('input', { type: 'file', accept: '.csv,text/csv', hidden: true }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const { entries, errors } = parseMapping(await decodeText(file));
    if (errors.length) {
      toast(`编码表格式错误，未导入：${errors.slice(0, 3).join('；')}`, 'error', 8000);
      return;
    }
    const warnings = new CodeBook().seed(entries);
    state.imported = { fileName: file.name, entries };
    for (const w of warnings.slice(0, 3)) toast(w, 'error', 8000);
    changed(`已导入 ${entries.length} 笔编码，相同的值会沿用原编码`);
  });
  return el(
    'div',
    { class: 'code-scope' },
    el('label', { class: 'check-label' }, shared, ' 整批共用编码：同一批文件中，相同的值使用同一个编码（方便跨文件对照）'),
    el('div', { class: 'code-options-row' },
      button(state.imported ? '改导入其他编码表' : '导入既有编码表（沿用编码）', () => input.click(), 'btn btn-small'),
      state.imported
        ? el('span', {}, ` 已导入「${state.imported.fileName}」共 ${state.imported.entries.length} 笔 `, button('移除', () => {
            state.imported = null;
            changed('已移除导入的编码表');
          }, 'btn btn-ghost btn-small'))
        : null,
      input,
    ),
    el('p', { class: 'muted small' }, '导入上次下载的编码表（或合并编码表）后，相同的值会沿用原编码，新值才产生新编码，可用于每月数据串接。合并编码表会累积历次所有个人信息，请长期妥善保管；导入的编码表只存在这个分页的记忆体中。'),
  );
}

function renderPasteBox(root: HTMLElement): HTMLElement {
  const area = el('textarea', { class: 'input paste-area', rows: '6', placeholder: '或直接把文字贴在这里（例如信件、对话记录、报表内容），再按「开始去标识化」' }) as HTMLTextAreaElement;
  const go = () => {
    const text = area.value;
    if (!text.trim()) {
      toast('请先贴上文字', 'error');
      return;
    }
    const n = state.docs.filter((d) => d.doc.fileName.startsWith('贴上的文字')).length;
    void loadFiles([new File([text], n === 0 ? '贴上的文字.txt' : `贴上的文字-${n + 1}.txt`, { type: 'text/plain' })], root);
  };
  area.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') go();
  });
  return el(
    'div',
    { class: 'paste-box' },
    el('div', { class: 'paste-divider' }, el('span', {}, '或')),
    area,
    el('div', { class: 'paste-actions' }, button('开始去标识化', go, 'btn btn-primary'), el('span', { class: 'muted small' }, '贴上的文字会以纯文字处理，结果可下载为 .txt 或直接复制')),
  );
}

/** A small dropdown of secondary actions; closes after picking one. */
function menu(label: string, items: ([string, () => void] | null)[]): HTMLElement {
  const box = el('details', { class: 'menu' }) as HTMLDetailsElement;
  const list = el('div', { class: 'menu-list' });
  for (const it of items) {
    if (!it) continue;
    list.append(button(it[0], () => {
      box.open = false;
      it[1]();
    }, 'menu-item'));
  }
  box.append(el('summary', { class: 'btn' }, label), list);
  return box;
}

const withTip = (e: HTMLElement, tip: string): HTMLElement => {
  e.dataset.tip = tip;
  return e;
};

function renderToolbar(root: HTMLElement): HTMLElement {
  const d = current();
  const doc = d.doc;
  const limits = formatLimitations(doc.format, doc.ocr);
  const many = state.docs.length > 1;
  const partialCats = [...new Set(d.items.filter((it) => it.active && isPartial(it)).map((it) => it.category))];
  const text = doc.format === 'txt' || doc.format === 'md';
  const mode = [
    `${OUTPUT_MODE_LABELS[state.outputMode]}・${MARKER_LABELS[state.marker]}（${restorable() ? '可还原' : '无法还原'}）`,
    restorable() && state.sharedCodes ? '整批共用编码' : '',
    restorable() && state.imported ? `沿用「${state.imported.fileName}」的编码` : '',
  ].filter(Boolean);
  const moreItems: ([string, () => void] | null)[] = [
    many ? [restorable() ? '下载此文件（文件＋编码表）' : '下载此文件', () => void downloadBoth(d, root)] : null,
    restorable() ? ['只下载去标识化文件', () => void downloadDoc(d, root)] : null,
    restorable() ? ['只下载编码表 (CSV)', () => downloadCsv(d, root)] : null,
    text ? ['复制去标识化文字', () => void copyText(d)] : null,
    hasMergedTable() ? ['下载合并编码表', downloadMerged] : null,
  ];
  const more = moreItems.some(Boolean) ? menu('更多 ▾', moreItems) : null;
  return el(
    'div',
    { class: 'toolbar toolbar-stack' },
    el('div', { class: 'toolbar-row' },
      el('div', { class: 'file-info' },
        el('strong', {}, doc.fileName),
        el('span', { class: 'badge' }, doc.format.toUpperCase()),
        doc.ocr ? el('span', { class: 'badge badge-ocr', 'data-tip': '此文件为扫描影像，文字由浏览器内的文字识别（OCR）取得' }, '文字识别') : null,
        el('span', { class: 'muted' }, ` ${doc.text.length.toLocaleString()} 字`),
        many ? el('span', { class: 'muted' }, `　（第 ${state.active + 1} / ${state.docs.length} 个文件）`) : null,
      ),
      el('div', { class: 'toolbar-actions' },
        button('重新检测', () => redetect(root), 'btn'),
        button(many ? '全部清除' : '换一个文件', () => resetAll(root), 'btn btn-ghost'),
        many
          ? button(`打包下载全部（${state.docs.length} 个文件）`, () => void downloadAll(root), 'btn btn-primary btn-strong')
          : withTip(button(restorable() ? '下载（文件＋编码表）' : '下载去标识化文件', () => void downloadBoth(d, root), 'btn btn-primary btn-strong'), restorable() ? '编码表是还原的唯一凭证，请妥善保管' : '不需还原：只下载去标识化文件'),
        more,
      ),
    ),
    el('div', { class: 'toolbar-row status-line muted small' },
      el('span', { class: 'status-mode' }, mode.join('・')),
      limits ? el('span', { class: 'status-info', 'data-tip': limits, tabindex: '0' }, 'ⓘ 格式限制') : null,
      partialCats.length
        ? el('span', { class: 'status-partial notice notice-inline', 'data-tip': `${partialCats.join('、')}：保留的字符会出现在输出中，并非完全匿名`, tabindex: '0' }, `⚠ 含部分保留（${partialCats.length} 类）`)
        : null,
    ),
  );
}

function renderFilePanel(root: HTMLElement): HTMLElement {
  const panel = el('aside', { class: 'file-panel' });
  const list = el('ul', { class: 'file-list' });
  state.docs.forEach((d, i) => {
    const active = d.items.filter((it) => it.active).length;
    list.append(
      el(
        'li',
        { class: `file-item${i === state.active ? ' active' : ''}` },
        el('button', { type: 'button', class: 'file-item-main', onClick: () => { state.active = i; render(root); } },
          el('span', { class: 'file-item-name', title: d.doc.fileName }, d.doc.fileName),
          el('span', { class: 'file-item-meta' },
            el('span', { class: 'badge' }, d.doc.format.toUpperCase()),
            el('span', { class: 'muted small' }, ` ${active} / ${d.items.length} 笔`),
            isDownloaded(d) ? el('span', { class: 'tag tag-done' }, '已下载') : null,
          ),
        ),
        el('button', { type: 'button', class: 'file-item-remove', title: '移除此文件', onClick: () => removeDoc(i, root) }, '×'),
      ),
    );
  });
  const input = el('input', { type: 'file', accept: ACCEPT_ATTR, multiple: true, hidden: true }) as HTMLInputElement;
  input.addEventListener('change', () => {
    if (input.files?.length) void loadFiles(Array.from(input.files), root);
    input.value = '';
  });
  panel.append(
    el('div', { class: 'file-panel-head' }, el('h3', {}, `文件（${state.docs.length}/${MAX_FILES}）`)),
    list,
    state.docs.length < MAX_FILES ? button('＋ 加入文件', () => input.click(), 'btn btn-small') : el('p', { class: 'muted small' }, `已达 ${MAX_FILES} 个上限`),
    input,
  );
  return panel;
}

function renderWorkspace(root: HTMLElement): HTMLElement {
  const d = current();
  const preview = el('div', { class: 'preview', tabindex: '0' });
  const sidebar = el('aside', { class: 'sidebar' });
  const outputHost = el('div', {});
  const headTools = el('div', { class: 'preview-head-tools' });
  const previewWrap = el('div', { class: 'preview-wrap' },
    el('div', { class: 'preview-head' }, el('h3', {}, '去标识化预览'), headTools),
    el('p', { class: 'muted small preview-desc' }, `预览即下载后的样子${restorable() ? '（编码以 [类别] 显示）' : ''}：点标记可取消、框选文字可新增，鼠标停留可看原文。${previewHint(d.doc)}`),
    outputHost,
    preview,
  );
  const ws = el('div', { class: 'workspace' });
  const refresh = () => {
    clear(outputHost);
    outputHost.append(renderOutputPanel(root));
    clear(headTools);
    const active = d.items.filter((it) => it.active).length;
    const plain = el('input', { type: 'checkbox' }) as HTMLInputElement;
    plain.checked = state.plainView;
    plain.addEventListener('change', () => {
      state.plainView = plain.checked;
      refresh();
    });
    if (d.doc.layout) headTools.append(el('label', { class: 'check-label small' }, plain, ' 纯文字检视'));
    headTools.append(
      button(`${state.showList ? '▾ 收合' : '▸ 展开'}检测清单（生效 ${active} / 共 ${d.items.length}）`, () => {
        state.showList = !state.showList;
        refresh();
      }, `btn btn-small list-toggle${state.showList ? ' is-open' : ''}`),
    );
    ws.classList.toggle('workspace-with-list', state.showList);
    ws.classList.toggle('workspace-with-files', state.docs.length > 1);
    sidebar.hidden = !state.showList;
    renderPreview(preview, refresh, root);
    if (state.showList) renderSidebar(sidebar, preview, refresh);
  };
  if (state.docs.length > 1) ws.append(renderFilePanel(root));
  ws.append(previewWrap, sidebar);
  refresh();
  return ws;
}

/**
 * The single place to decide what the output shows: mode, per-category on/off and retention,
 * 设为默认, and the code scope. Collapsed to a one-line summary by default.
 */
function renderOutputPanel(root: HTMLElement): HTMLElement {
  const setMode = (mode: OutputMode) => {
    state.outputMode = mode;
    applyOutputModeToAll();
    render(root); // preview, toolbar status and partial-retention notice all change
  };
  // The output text changes, codes do not: every document needs downloading again.
  const setMarker = (marker: MarkerStyle) => {
    state.marker = marker;
    for (const d of state.docs) markDirty(d);
    render(root);
  };
  /** One choice as a row of joined buttons (radios underneath, so keyboard use is unchanged). */
  const segmented = <T extends string>(name: string, labels: Record<T, string>, current: T, onChange: (v: T) => void) =>
    el('div', { class: 'segmented', role: 'radiogroup' },
      ...(Object.keys(labels) as T[]).map((v) => {
        const r = el('input', { type: 'radio', name, value: v }) as HTMLInputElement;
        r.checked = current === v;
        r.addEventListener('change', () => onChange(v));
        return el('label', { class: 'segment' }, r, el('span', {}, labels[v]));
      }),
    );
  const [markerExample, markerNote] = MARKER_NOTES[state.marker];
  const notices = [
    state.outputMode === 'preview' ? '部分保留会露出姓氏、证号前 2 码、手机前 4 码等，并非完全匿名' : '',
    restorable() ? '' : `不需还原：只下载文件、没有编码表${state.marker === 'blank' ? '；空白占位会保留原本的字数，需要更高的匿名性请选「类别」' : ''}`,
  ].filter(Boolean);
  const section = (cls: string, title: string, open: boolean, onToggle: (open: boolean) => void, ...body: (HTMLElement | null)[]) => {
    const d = el('details', { class: `output-section ${cls}`, open }, el('summary', {}, title), ...body.filter((b): b is HTMLElement => b !== null)) as HTMLDetailsElement;
    d.addEventListener('toggle', () => onToggle(d.open));
    return d;
  };
  const present = CATEGORIES.filter((c) => state.docs.some((d) => d.items.some((it) => it.category === c))).length;
  const active = state.docs.reduce((n, d) => n + d.items.filter((it) => it.active).length, 0);
  const box = el('details', { class: 'output-panel', open: state.panelOpen }) as HTMLDetailsElement;
  // The summary must read as a control, not a caption: a mode pill plus an explicit 调整 ▾ button.
  const action = el('span', { class: 'btn btn-small summary-action' }, state.panelOpen ? '收合 ▴' : '调整 ▾');
  box.addEventListener('toggle', () => {
    state.panelOpen = box.open;
    action.textContent = box.open ? '收合 ▴' : '调整 ▾';
  });
  const saveDefault = () => {
    let config = loadConfig();
    for (const [category, r] of state.overrides) config = setCategoryRetention(config, category, r);
    saveConfig(config);
    // The saved default is now each item's own rule retention, so the output stays the same after clearing overrides.
    for (const d of state.docs) {
      for (const it of d.items) {
        const r = state.overrides.get(it.category);
        if (!r) continue;
        if (r.mode === 'none') delete it.retention;
        else it.retention = r;
      }
    }
    state.overrides.clear();
    toast('已设为默认：之后选「自定义」会套用这些保留方式（可在「检测规则」页各规则的「查看规则」中看到）', 'success', 5000);
    render(root);
  };
  const children: (HTMLElement | null)[] = [
    el('summary', { class: 'output-panel-summary', title: '调整保留多少、标记方式、类别与编码范围' },
      el('span', { class: 'summary-main' },
        el('strong', {}, '输出设置'),
        // Shown while collapsed; the rows below say the same once open.
        el('span', { class: 'mode-pill summary-detail' }, OUTPUT_MODE_LABELS[state.outputMode]),
        el('span', { class: `mode-pill summary-detail${restorable() ? '' : ' mode-pill-final'}` }, restorable() ? MARKER_LABELS.code : `${MARKER_LABELS[state.marker]}・无法还原`),
        el('span', { class: `summary-detail ${exampleClass('small muted')}` }, modeExample(state.outputMode, state.marker)),
        el('span', { class: 'muted small' }, `生效 ${active} 笔${hasMergedTable() ? '・共用／沿用编码' : ''}`),
      ),
      action,
    ),
    el('div', { class: 'output-rows' },
      el('div', { class: 'output-row', 'data-row': 'keep' },
        el('span', { class: 'output-row-label' }, '保留'),
        segmented('output-mode', OUTPUT_MODE_LABELS, state.outputMode, setMode),
        el('span', { class: `output-row-note ${exampleClass('small muted')}` }, modeExample(state.outputMode, state.marker)),
      ),
      el('div', { class: 'output-row', 'data-row': 'marker' },
        el('span', { class: 'output-row-label' }, '标记'),
        segmented('marker-style', MARKER_LABELS, state.marker, setMarker),
        el('span', { class: 'output-row-note small muted' }, el('span', { class: exampleClass('') }, markerExample), `　${markerNote}`),
      ),
    ),
    notices.length ? el('p', { class: 'small notice notice-inline output-notice' }, `⚠ ${notices.join('；')}`) : null,
    section('by-category', `依类别调整（${present} 类）`, state.outputMode === 'custom' || state.categoriesOpen, (open) => (state.categoriesOpen = open),
      renderCategoryTable(root),
      state.outputMode === 'custom'
        ? el('div', { class: 'form-actions' },
            button('设为默认', saveDefault, 'btn btn-small'),
            el('span', { class: 'muted small' }, state.overrides.size ? '把目前各类别的保留方式存为默认，之后选「自定义」会自动套用。' : '目前沿用默认值。'),
          )
        : null,
    ),
    restorable() ? section('code-advanced', '高级：编码范围', state.advancedOpen, (open) => (state.advancedOpen = open), renderCodeScope(root)) : null,
  ];
  box.append(...children.filter((c): c is HTMLElement => c !== null));
  return box;
}

function renderCategoryTable(root: HTMLElement): HTMLElement {
  const present = CATEGORIES.filter((c) => state.docs.some((d) => d.items.some((it) => it.category === c)));
  if (present.length === 0) return el('p', { class: 'muted small' }, '目前没有检测项目。');
  const custom = state.outputMode === 'custom';
  const rows = present.map((category) => {
    const items = state.docs.flatMap((d) => d.items).filter((it) => it.category === category);
    const sample = items[0].original;
    const off = state.disabledCategories.has(category);
    const enabled = el('input', { type: 'checkbox', title: '取消勾选即整类不去标识化（套用到所有文件）' }) as HTMLInputElement;
    enabled.checked = !off;
    enabled.addEventListener('change', () => {
      setCategoryEnabled(category, enabled.checked);
      render(root);
    });
    const override = state.overrides.get(category);
    const applied: Retention | undefined = state.outputMode === 'code' ? undefined : state.outputMode === 'preview' ? { mode: 'preview' } : override ?? ruleRetention(category);
    const out = el('span', { class: exampleClass('small') });
    const msg = el('span', { class: 'small' });
    const show = (r: Retention | undefined) => {
      const s = splitFor(sample, r, category);
      const hidden = sample.slice(s.head, sample.length - s.tail);
      out.textContent = `${sample} → ${sample.slice(0, s.head)}${state.marker === 'blank' ? blankOut(hidden) : `[${category}]`}${sample.slice(sample.length - s.tail)}`;
    };
    show(applied);
    let control: HTMLElement;
    if (!custom || off) {
      control = el('span', { class: 'muted small' }, off ? '不处理' : describeRetention(applied));
    } else {
      const current: Retention = override ?? ruleRetention(category) ?? { mode: 'none' };
      const mode = el('select', { class: 'select' },
        el('option', { value: 'rule' }, `默认（${describeRetention(ruleRetention(category))}）`),
        ...modesFor(category).map((m) => el('option', { value: m }, MODE_LABELS[m])),
      ) as HTMLSelectElement;
      mode.value = override ? override.mode : 'rule';
      const head = el('input', { class: 'input input-num', type: 'number', min: '0', value: String(current.mode === 'ends' ? current.head : 0) }) as HTMLInputElement;
      const tail = el('input', { class: 'input input-num', type: 'number', min: '0', value: String(current.mode === 'ends' ? current.tail : 0) }) as HTMLInputElement;
      const delim = el('input', { class: 'input input-num', value: current.mode === 'delim' ? current.delimiter : '@' }) as HTMLInputElement;
      const side = el('select', { class: 'select' }, el('option', { value: 'after' }, '之后'), el('option', { value: 'before' }, '之前')) as HTMLSelectElement;
      if (current.mode === 'delim') side.value = current.side;
      const endsBox = el('span', { class: 'retention-fields', hidden: mode.value !== 'ends' }, '前 ', head, ' 后 ', tail);
      const delimBox = el('span', { class: 'retention-fields', hidden: mode.value !== 'delim' }, delim, side);
      const read = (): Retention | null => {
        const m = mode.value as RetentionMode | 'rule';
        if (m === 'rule') return null;
        if (m === 'ends') return { mode: 'ends', head: Number(head.value), tail: Number(tail.value) };
        if (m === 'delim') return { mode: 'delim', delimiter: delim.value, side: side.value as 'before' | 'after' };
        return { mode: m } as Retention;
      };
      const paint = (r: Retention | null): boolean => {
        const check = r ? checkRetention(sample, r, category) : { error: null, warnings: [] };
        msg.className = `small ${check.error ? 'field-error' : check.warnings.length ? 'notice notice-inline' : ''}`;
        msg.textContent = check.error ?? (check.warnings.length ? `⚠ ${check.warnings.join(' ')}` : '');
        show(r ?? ruleRetention(category));
        return !check.error;
      };
      const apply = () => {
        endsBox.hidden = mode.value !== 'ends';
        delimBox.hidden = mode.value !== 'delim';
        const r = read();
        if (!paint(r)) return; // keep the invalid input on screen with its error, output unchanged
        if (r) state.overrides.set(category, r);
        else state.overrides.delete(category);
        applyOutputModeToAll();
        render(root);
      };
      for (const input of [mode, head, tail, delim, side]) input.addEventListener('change', apply);
      paint(override ?? null);
      control = el('span', { class: 'retention-control' }, mode, endsBox, delimBox);
    }
    return el('tr', { class: off ? 'row-disabled' : '' },
      el('td', { class: 'col-nowrap' }, el('label', { class: 'check-label' }, enabled, el('span', { class: `badge badge-${category}` }, category), el('span', { class: 'muted small' }, ` ${items.length} 笔`))),
      el('td', {}, control),
      el('td', {}, out, ' ', msg),
    );
  });
  return el('div', { class: 'table-wrap' }, el('table', { class: 'table output-table' }, el('tbody', {}, ...rows)));
}

function previewHint(doc: LoadedDocument): string {
  if (doc.layout?.kind === 'xlsx') return '上方可切换工作表。';
  if (doc.layout?.kind === 'pdf' && doc.ocr) return '绿框图片会保留在输出中（可逐张取消），请对照原文件核对。';
  return '';
}

function renderPreview(preview: HTMLElement, refresh: () => void, root: HTMLElement): void {
  const d = current();
  const decorations: Decoration[] = d.items.map((it) =>
    it.active
      ? { start: it.start, end: it.end, id: it.id, kind: 'mark', label: previewLabel(it, state.marker), className: `mark-${it.category}`, tip: tooltipFor(it) }
      : { start: it.start, end: it.end, id: it.id, kind: 'cancelled', label: '', className: '', tip: `已取消，显示原文（${it.category}）；点击可加回` },
  );
  renderDocumentPreview(preview, d.doc, decorations, {
    plain: state.plainView,
    onTogglePicture: (pic) => {
      pic.keep = !pic.keep;
      markDirty(d);
      refresh();
    },
  });
  preview.onmouseup = () => handleSelection(preview, refresh, root);
  preview.onclick = (e) => {
    const target = (e.target as Element | null)?.closest<HTMLElement>('[data-id]');
    if (!target || !preview.contains(target)) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // a drag-selection, not a click
    const item = d.items.find((it) => it.id === target.dataset.id);
    if (item) showItemPopup(target.getBoundingClientRect(), item, refresh, root);
  };
}

function showItemPopup(rect: DOMRect, item: RedactionItem, done: () => void, root: HTMLElement): void {
  document.querySelector('.add-popup')?.remove();
  const d = current();
  const popup = el(
    'div',
    { class: 'add-popup' },
    el('div', { class: 'add-popup-text' },
      el('span', { class: `badge badge-${item.category}` }, item.category),
      ` ${item.original} → ${previewLabel(item, state.marker)}`,
      el('div', { class: 'muted small' }, `输出标记 ${outputFor(item, state.marker)}${item.origin === 'manual' ? '（手动新增）' : ''}`),
    ),
    el('div', { class: 'add-popup-row' },
      el('span', {}, item.active ? '要取消这一笔的去标识化吗？' : '要把这一笔加回去标识化吗？'),
      button(item.active ? '取消去标识化' : '加回', () => {
        try {
          toggleItem(d.items, item.id);
          markDirty(d);
          popup.remove();
          done();
        } catch (err) {
          toast((err as Error).message, 'error');
        }
      }, item.active ? 'btn btn-danger-solid' : 'btn btn-primary'),
      button('关闭', () => popup.remove(), 'btn btn-ghost'),
    ),
  );
  placePopup(popup, rect, root);
}

function placePopup(popup: HTMLElement, rect: DOMRect, root: HTMLElement): void {
  const top = rect.bottom + window.scrollY + 6;
  const left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 380));
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
  root.ownerDocument.body.append(popup);
}

function offsetOf(container: Node, offset: number): number | null {
  const elNode = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
  const holder = elNode?.closest('[data-start]') as HTMLElement | null;
  if (!holder) return null;
  const base = Number(holder.dataset.start);
  if (holder.dataset.plain) {
    return container.nodeType === Node.TEXT_NODE ? base + offset : base;
  }
  // Inside a mark/cancelled span: snap to its boundary.
  return offset === 0 ? base : Number(holder.dataset.end);
}

function handleSelection(preview: HTMLElement, refresh: () => void, root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!preview.contains(range.startContainer) || !preview.contains(range.endContainer)) return;
  const a = offsetOf(range.startContainer, range.startOffset);
  const b = offsetOf(range.endContainer, range.endOffset);
  if (a === null || b === null) return;
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (end <= start) return;
  showAddPopup(range.getBoundingClientRect(), start, end, () => {
    sel.removeAllRanges();
    refresh();
  }, root);
}

function showAddPopup(rect: DOMRect, start: number, end: number, done: () => void, root: HTMLElement): void {
  document.querySelector('.add-popup')?.remove();
  const d = current();
  const text = d.doc.text.slice(start, end);
  const select = el('select', { class: 'select' }, ...CATEGORIES.map((c) => el('option', { value: c }, c))) as HTMLSelectElement;
  const popup = el(
    'div',
    { class: 'add-popup' },
    el('div', { class: 'add-popup-text' }, `「${text.length > 40 ? text.slice(0, 40) + '…' : text}」`),
    el('div', { class: 'add-popup-row' }, select, button('新增为去标识化项目', () => {
      try {
        // FR-009: manual items follow their category's retention, like detected ones.
        const rule = getEffectivePatterns().find((p) => p.enabled && p.category === select.value);
        addManualItem(d.items, d.doc.text, start, end, select.value as Category, d.book, rule?.retention);
        applyOutputMode(d);
        markDirty(d);
        popup.remove();
        toast('已新增', 'success', 1500);
        done();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }, 'btn btn-primary'), button('取消', () => popup.remove(), 'btn btn-ghost')),
  );
  placePopup(popup, rect, root);
}

function renderSidebar(sidebar: HTMLElement, preview: HTMLElement, refresh: () => void): void {
  clear(sidebar);
  const d = current();
  const active = d.items.filter((it) => it.active);

  const list = el('ul', { class: 'item-list' });
  const sorted = [...d.items].sort((a, b) => a.start - b.start);
  for (const it of sorted) {
    const li = el(
      'li',
      { class: `item ${it.active ? '' : 'item-cancelled'}` },
      el('div', { class: 'item-main', title: tooltipFor(it), onClick: () => locate(preview, it.id) },
        el('span', { class: `badge badge-${it.category}` }, it.category),
        el('span', { class: 'item-original' }, it.original),
        el('span', { class: 'item-mask muted' }, `→ ${previewLabel(it, state.marker)}`),
        it.origin === 'manual' ? el('span', { class: 'tag' }, '手动') : null,
      ),
      el('div', { class: 'item-meta' }, button(it.active ? '取消' : '加回', () => {
        try {
          toggleItem(d.items, it.id);
          markDirty(d);
          refresh();
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      }, 'btn btn-small')),
    );
    list.append(li);
  }

  sidebar.append(
    el('h3', {}, `检测项目（生效 ${active.length} / 共 ${d.items.length}）`),
    d.items.length === 0 ? el('p', { class: 'muted' }, '目前没有项目。可在预览中框选文字新增。') : list,
  );
}

function locate(preview: HTMLElement, id: string): void {
  const node = preview.querySelector<HTMLElement>(`[data-id="${id}"]`);
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), 1200);
}

// ---------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------
/** FR-002: a lone download whose partner was taken from an older version would not restore. */
function warnIfStale(partnerVer: number, d: DocState, partner: string): void {
  if (partnerVer >= 0 && partnerVer !== d.version) {
    toast(`之前下载的${partner}是旧版本，和这次的文件对不起来，请重新下载${partner}`, 'error', 8000);
  }
}

async function saveDoc(d: DocState): Promise<void> {
  const { edits } = applyRedactions(d.doc.text, d.items, state.marker);
  const blob = await generateDocument(d.doc, edits);
  downloadBlob(blob, outputFileName(d.doc.fileName, 'deid'));
  d.docVer = d.version;
}

function saveCsv(d: DocState): void {
  const { mapping } = applyRedactions(d.doc.text, d.items);
  downloadBlob(new Blob([serializeMapping(mapping)], { type: 'text/csv;charset=utf-8' }), mappingFileName(d.doc.fileName));
  d.csvVer = d.version;
}

/** The main action: the document and its mapping table together, so the pair always matches. */
async function downloadBoth(d: DocState, root: HTMLElement): Promise<void> {
  try {
    toast('产生文件中…', 'info', 2000);
    await saveDoc(d);
    if (restorable()) saveCsv(d);
    toast(restorable() ? '已下载去标识化文件与编码表' : '已下载去标识化文件', 'success');
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

async function downloadDoc(d: DocState, root: HTMLElement): Promise<void> {
  try {
    toast('产生文件中…', 'info', 2000);
    await saveDoc(d);
    warnIfStale(d.csvVer, d, '编码表');
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

function downloadCsv(d: DocState, root: HTMLElement): void {
  saveCsv(d);
  warnIfStale(d.docVer, d, '去标识化文件');
  render(root);
}

function downloadMerged(): void {
  downloadBlob(new Blob([serializeMapping(mergedMapping())], { type: 'text/csv;charset=utf-8' }), MERGED_MAPPING_NAME);
  toast('合并编码表涵盖导入的编码与本批所有编码，下次处理时可再导入沿用；请妥善保管', 'success', 5000);
}

async function copyText(d: DocState): Promise<void> {
  const { redactedText } = applyRedactions(d.doc.text, d.items, state.marker);
  try {
    await navigator.clipboard.writeText(redactedText);
    toast(restorable() ? '已复制去标识化文字（编码表仍需另外下载才能还原）' : '已复制去标识化文字', 'success', 4000);
  } catch {
    toast('无法访问剪贴簿，请改用下载', 'error');
  }
}

/** Every document plus its mapping table in one archive (see formats/batch.ts). */
async function downloadAll(root: HTMLElement): Promise<void> {
  try {
    toast(`打包 ${state.docs.length} 个文件中…`, 'info', 3000);
    const { blob } = await buildArchive(state.docs.map((d) => ({ doc: d.doc, items: d.items })), hasMergedTable() ? mergedMapping() : undefined, state.marker);
    for (const d of state.docs) {
      d.docVer = d.version;
      d.csvVer = d.version;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    downloadBlob(blob, `去标识化-${stamp}.zip`);
    toast(restorable() ? '已打包下载全部文件与编码表' : '已打包下载全部去标识化文件', 'success');
    render(root);
  } catch (e) {
    toast((e as Error).message, 'error', 7000);
  }
}

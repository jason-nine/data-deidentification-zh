import type { Category, CustomPatternConfig, Pattern, PatternConfig } from '../core/types';
import { CATEGORIES } from '../core/types';
import { getEffectivePatterns, loadConfig, newCustomId, removeCustom, saveConfig, setBuiltinEnabled, upsertCustom, validateRegex } from '../core/pattern-store';
import { describeRetention } from '../core/retention';
import { compilePattern } from '../core/detector';
import { button, clear, el, toast } from './components';

/** Filled into the "new rule" form by the 填入示例 button so first-time users can see a working rule end to end. */
const SAMPLE_RULE = {
  name: '员工编号',
  category: '标识符' as Category,
  regex: 'EMP-\\d{6}',
  sample: '承办人员工编号 EMP-004521，协办 EMP-000317；旧制编号 EMP-12345 位数不足，不会命中。',
};

/** Prompt users can paste into an AI assistant to get a rule that fits this tool's RegExp constraints. */
const AI_PROMPT = [
  '请帮我写一个 JavaScript 正规表达式，检测文件中的：（例如：员工编号，EMP- 开头接 6 位数字）',
  '',
  "限制：以 new RegExp(规则, 'gu') 搜索整份文件；不要加斜线、flags、^ 或 $；不可比对空字符串；避免误抓一般文字。",
  '',
  '请只回复以下四项：',
  '1. 名称',
  `2. 类别（${CATEGORIES.join('／')} 择一）`,
  '3. 规则',
  '4. 测试文字：一段 2～3 句的文字，同时包含应命中与不应命中的例子',
].join('\n');

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  // Plain-http intranet hosting has no navigator.clipboard; fall back to the legacy command.
  const ta = el('textarea', { readonly: true, style: 'position:fixed;opacity:0' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

/** What is open on the page: the form, and the rules whose details are shown. Not stored. */
const ui = { formOpen: false, details: new Set<string>(), closedGroups: new Set<string>() };

const GROUPS = [
  { id: 'cn', title: '中国大陆格式' },
  { id: 'intl', title: '国际与通用格式' },
  { id: 'custom', title: '自定义规则' },
] as const;

export function createPatternsView(): HTMLElement {
  const root = el('section', { class: 'view patterns-view' });
  render(root);
  return root;
}

function render(root: HTMLElement, editing: CustomPatternConfig | null = null): void {
  clear(root);
  const config = loadConfig();
  const patterns = getEffectivePatterns(config);
  const form = ui.formOpen || editing ? renderForm(root, config, editing) : null;
  root.append(
    el('div', { class: 'rules-head' },
      el('h2', {}, '检测规则'),
      form ? null : button('＋ 新增自定义规则', () => {
        ui.formOpen = true;
        render(root);
      }, 'btn btn-primary add-rule'),
    ),
    el('p', { class: 'muted small' }, '内置规则可停用、不可修改；自定义规则可新增、编辑、删除。点「查看规则」可看完整的匹配规则（JavaScript RegExp，flags: gu）、校验方式与默认保留方式。设置只保存在你的浏览器。'),
    ...(form ? [form] : []),
    ...GROUPS.map((g) => renderGroup(root, config, g, patterns.filter((p) => (g.id === 'custom' ? p.source === 'custom' : p.group === g.id)))),
  );
  form?.querySelector<HTMLInputElement>('input')?.focus();
}

/** Switches a rule on or off in the stored settings. */
function setEnabled(config: PatternConfig, p: Pattern, enabled: boolean): PatternConfig {
  if (p.source === 'builtin') return setBuiltinEnabled(config, p.id, enabled);
  return upsertCustom(config, { ...config.customPatterns.find((c) => c.id === p.id)!, enabled });
}

function renderGroup(root: HTMLElement, config: PatternConfig, group: (typeof GROUPS)[number], patterns: Pattern[]): HTMLElement {
  const on = patterns.filter((p) => p.enabled).length;
  const all = el('input', { type: 'checkbox', class: 'group-toggle', 'aria-label': `${group.title}全部启用` }) as HTMLInputElement;
  all.checked = patterns.length > 0 && on === patterns.length;
  all.indeterminate = on > 0 && on < patterns.length;
  all.disabled = patterns.length === 0;
  // Inside the summary: a click on the box must not also fold the group.
  all.addEventListener('click', (e) => e.stopPropagation());
  all.addEventListener('change', () => {
    let next = config;
    for (const p of patterns) next = setEnabled(next, p, all.checked);
    saveConfig(next);
    toast(`${group.title}已全部${all.checked ? '启用' : '停用'}`, 'success', 1500);
    render(root);
  });
  const box = el('details', { class: 'rule-group', 'data-group': group.id, open: !ui.closedGroups.has(group.id) && (group.id !== 'custom' || patterns.length > 0) }) as HTMLDetailsElement;
  box.addEventListener('toggle', () => (box.open ? ui.closedGroups.delete(group.id) : ui.closedGroups.add(group.id)));
  box.append(
    el('summary', { class: 'rule-group-head' },
      el('span', { class: 'rule-group-title' }, `${group.title}（${patterns.length}）`),
      el('label', { class: 'group-toggle-label muted small' }, all, ' 全部启用'),
    ),
    patterns.length === 0
      ? el('p', { class: 'muted small rule-empty' }, '尚无自定义规则。按「＋ 新增自定义规则」可以用正规表达式新增，例如员工编号、病历号码。')
      : el('div', { class: 'rule-list' }, ...patterns.flatMap((p) => renderRule(root, config, p))),
  );
  return box;
}

function renderRule(root: HTMLElement, config: PatternConfig, p: Pattern): HTMLElement[] {
  const toggle = el('input', { type: 'checkbox', class: 'rule-toggle', 'aria-label': `启用 ${p.name}` }) as HTMLInputElement;
  toggle.checked = p.enabled;
  toggle.addEventListener('change', () => {
    saveConfig(setEnabled(config, p, toggle.checked));
    toast(`${p.name} 已${toggle.checked ? '启用' : '停用'}`, 'success', 1500);
    render(root);
  });
  const open = ui.details.has(p.id);
  const more = button(open ? '收合' : '查看规则', () => {
    if (open) ui.details.delete(p.id);
    else ui.details.add(p.id);
    render(root);
  }, 'btn btn-small btn-ghost rule-more');
  more.setAttribute('aria-expanded', String(open));
  const row = el('div', { class: `rule-row${p.enabled ? '' : ' row-disabled'}`, 'data-id': p.id },
    el('label', { class: 'switch' }, toggle),
    el('span', { class: 'rule-name' }, p.name),
    el('span', { class: `badge badge-${p.category}` }, p.category),
    el('span', { class: 'rule-example muted small', title: p.example }, p.example),
    more,
  );
  if (!open) return [row];
  const custom = config.customPatterns.find((c) => c.id === p.id);
  const kept = p.retention && p.retention.mode !== 'none';
  const detail = el('dl', { class: 'rule-detail' },
    el('dt', {}, '匹配规则'), el('dd', {}, el('code', { class: 'regex' }, p.regex)),
    p.note ? el('dt', {}, '校验') : null, p.note ? el('dd', {}, p.note) : null,
    el('dt', {}, '默认保留'), el('dd', {}, el('span', { class: kept ? 'tag tag-kept' : '' }, describeRetention(p.retention)), el('span', { class: 'muted small' }, '（输出设置选「自定义」时套用；要调整请到「去标识化」页按「设为默认」）')),
    el('dt', {}, '来源'), el('dd', {}, p.source === 'builtin' ? '内置' : '自定义'),
    custom
      ? el('dd', { class: 'rule-actions' },
          button('编辑', () => render(root, custom), 'btn btn-small'),
          button('删除', () => {
            if (!confirm(`删除自定义规则「${p.name}」？`)) return;
            saveConfig(removeCustom(config, p.id));
            render(root);
          }, 'btn btn-small btn-danger'),
        )
      : null,
  );
  return [row, detail];
}

function renderForm(root: HTMLElement, config: PatternConfig, editing: CustomPatternConfig | null): HTMLElement {
  const name = el('input', { class: 'input', placeholder: '例如：员工编号', value: editing?.name ?? '' }) as HTMLInputElement;
  const category = el('select', { class: 'select' }, ...CATEGORIES.map((c) => el('option', { value: c }, c))) as HTMLSelectElement;
  category.value = editing?.category ?? '标识符';
  const regex = el('input', { class: 'input mono', placeholder: '例如：EMP-\\d{6}', value: editing?.regex ?? '' }) as HTMLInputElement;
  const sample = el('textarea', { class: 'input', rows: '3', placeholder: '贴上测试文字，即时检视命中结果；第一笔命中会作为规则列表的示例' }) as HTMLTextAreaElement;
  sample.value = editing?.example ?? '';
  const regexError = el('div', { class: 'field-error' });
  const hits = el('div', { class: 'hits' });

  /** Matches of the current rule in the test text (empty when the rule is invalid). */
  const matches = (): string[] => {
    if (validateRegex(regex.value) || !sample.value) return [];
    const re = compilePattern({ regex: regex.value } as Pattern);
    return re ? [...sample.value.matchAll(re)].map((m) => m[0]) : [];
  };

  const preview = () => {
    const err = validateRegex(regex.value);
    regexError.textContent = err ?? '';
    clear(hits);
    if (err || !sample.value) return;
    const found = matches();
    hits.append(found.length === 0 ? el('span', { class: 'muted' }, '无命中') : el('span', {}, `命中 ${found.length} 笔：`), ...found.map((f) => el('mark', { class: 'mark mark-标识符' }, f)));
  };
  regex.addEventListener('input', preview);
  sample.addEventListener('input', preview);
  if (editing) preview();

  const save = () => {
    const err = validateRegex(regex.value);
    if (err) {
      regexError.textContent = err;
      return;
    }
    if (!name.value.trim()) {
      toast('请输入规则名称', 'error');
      return;
    }
    try {
      const next = upsertCustom(config, {
        id: editing?.id ?? newCustomId(),
        name: name.value.trim(),
        category: category.value as Category,
        regex: regex.value,
        example: matches()[0] ?? editing?.example ?? '',
        enabled: editing?.enabled ?? true,
      });
      saveConfig(next);
      toast(editing ? '规则已更新' : '规则已新增', 'success');
      ui.formOpen = false;
      render(root);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const fillSample = () => {
    name.value = SAMPLE_RULE.name;
    category.value = SAMPLE_RULE.category;
    regex.value = SAMPLE_RULE.regex;
    sample.value = SAMPLE_RULE.sample;
    preview();
    toast('已填入示例规则，可直接修改，再按「新增规则」保存', 'info', 3000);
  };
  const copyPrompt = async () => {
    try {
      await copyToClipboard(AI_PROMPT);
      toast('已复制提示词，贴给 ChatGPT、Claude 或 Gemini 并改写第一行要检测的内容；回复的测试文字可贴到「测试文字」验证', 'success', 6000);
    } catch {
      toast('无法访问剪贴簿，请改用支持的浏览器', 'error');
    }
  };

  return el(
    'div',
    { class: 'form-card' },
    el('h3', {}, editing ? `编辑自定义规则：${editing.name}` : '新增自定义规则'),
    el('div', { class: 'form-grid' },
      el('label', {}, '名称', name),
      el('label', {}, '类别', category),
      el('label', { class: 'span-2' }, '匹配规则（RegExp）', regex, regexError),
      el('label', { class: 'span-2' }, '测试文字', sample, hits),
      el('p', { class: 'muted small span-2' }, '要保留部分字符（例如员工证保留第 1 码＝部门代码），请在「去标识化」页的输出设置把「保留」选「自定义」调整，再按「设为默认」。'),
    ),
    el('div', { class: 'form-actions' },
      button(editing ? '保存变更' : '新增规则', save, 'btn btn-primary'),
      button(editing ? '取消编辑' : '取消', () => {
        ui.formOpen = false;
        render(root);
      }, 'btn btn-ghost'),
      editing ? null : button('填入示例', fillSample, 'btn'),
      el('button', { class: 'btn', type: 'button', 'data-tip': AI_PROMPT, onClick: () => void copyPrompt() }, '复制 AI 提示词'),
    ),
  );
}


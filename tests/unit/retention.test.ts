import { describe, expect, it } from 'vitest';
import { checkRetention, describeRetention, firstExample, modesFor, sanitizeRetention, splitFor } from '../../src/core/retention';
import { CodeBook } from '../../src/core/codes';
import { addManualItem, detect, resplitItems } from '../../src/core/detector';
import { applyRedactions, mergeMappings, outputFor, previewLabel } from '../../src/core/redactor';
import { parseMapping, serializeMapping } from '../../src/core/csv';
import { restore } from '../../src/core/restorer';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { SUGGESTED_RETENTION } from '../helpers/retention-fixtures';
import type { Pattern, RedactionItem } from '../../src/core/types';

const SUGGESTED: Pattern[] = BUILTIN_PATTERNS.map((p) => ({ ...p, retention: SUGGESTED_RETENTION[p.id] }));

const ID1 = '110101199003078515';
const ID2 = '440305198512250027';

describe('splitFor', () => {
  it('keeps leading / trailing characters', () => {
    expect(splitFor(ID1, { mode: 'ends', head: 2, tail: 0 })).toEqual({ head: 2, tail: 0 });
    expect(splitFor('138-1234-5678', { mode: 'ends', head: 0, tail: 3 })).toEqual({ head: 0, tail: 3 });
  });

  it('hides everything when nothing would stay hidden', () => {
    expect(splitFor('AB12', { mode: 'ends', head: 2, tail: 2 })).toEqual({ head: 0, tail: 0 });
    expect(splitFor('abc', { mode: 'delim', delimiter: '@', side: 'after' })).toEqual({ head: 0, tail: 0 });
    expect(splitFor('@x', { mode: 'delim', delimiter: '@', side: 'after' })).toEqual({ head: 0, tail: 0 });
    expect(splitFor('王', { mode: 'surname' })).toEqual({ head: 0, tail: 0 });
  });

  it('uses the first delimiter for "after" and the last for "before"', () => {
    expect(splitFor('a@b@c.com', { mode: 'delim', delimiter: '@', side: 'after' })).toEqual({ head: 0, tail: 8 });
    expect(splitFor('a@b@c.com', { mode: 'delim', delimiter: '@', side: 'before' })).toEqual({ head: 4, tail: 0 });
  });

  it('keeps compound surnames whole', () => {
    expect(splitFor('王小明', { mode: 'surname' })).toEqual({ head: 1, tail: 0 });
    expect(splitFor('欧阳志明', { mode: 'surname' })).toEqual({ head: 2, tail: 0 });
  });

  it('keeps an address up to the province + city, or the district for municipalities', () => {
    expect(splitFor('浙江省杭州市西湖区文一西路969号', { mode: 'city' })).toEqual({ head: 3, tail: 0 });
    expect(splitFor('浙江省杭州市西湖区文一西路969号', { mode: 'district' })).toEqual({ head: 6, tail: 0 });
    // 直辖市：省即市，直接算到区
    expect(splitFor('北京市朝阳区建国路88号', { mode: 'district' })).toEqual({ head: 6, tail: 0 });
    expect(splitFor('北京市朝阳区建国路88号', { mode: 'city' })).toEqual({ head: 3, tail: 0 });
    // 没有省名时按市名起算；连市名都没有就全部隐藏
    expect(splitFor('杭州市西湖区文一西路969号', { mode: 'city' })).toEqual({ head: 3, tail: 0 });
    expect(splitFor('朝阳区建国路88号', { mode: 'district' })).toEqual({ head: 0, tail: 0 });
  });
});

describe('checkRetention', () => {
  it('rejects settings that keep the whole example', () => {
    expect(checkRetention(ID1, { mode: 'ends', head: 18, tail: 0 }).error).toMatch(/至少要隐藏/);
    expect(checkRetention('x', { mode: 'delim', delimiter: '', side: 'after' }).error).toMatch(/分隔符/);
  });

  it('warns when less than half is hidden or both ends are kept', () => {
    expect(checkRetention(ID1, { mode: 'ends', head: 2, tail: 0 })).toEqual({ error: null, warnings: [] });
    expect(checkRetention(ID1, { mode: 'ends', head: 12, tail: 0 }).warnings[0]).toMatch(/不到一半/);
    expect(checkRetention(ID1, { mode: 'ends', head: 2, tail: 2 }).warnings[0]).toMatch(/前后同时保留/);
  });

  it('warns when the example lacks the delimiter; semantic modes are exempt', () => {
    expect(checkRetention('EMP-001', { mode: 'delim', delimiter: '@', side: 'after' }).warnings[0]).toMatch(/全部隐藏/);
    expect(checkRetention('欧阳志明', { mode: 'surname' })).toEqual({ error: null, warnings: [] });
  });
});

describe('helpers', () => {
  it('describes, lists modes, reads examples, sanitizes', () => {
    expect(describeRetention({ mode: 'ends', head: 6, tail: 4 })).toBe('保留前 6 位＋后 4 位');
    expect(describeRetention({ mode: 'delim', delimiter: '@', side: 'after' })).toBe('保留「@」之后');
    expect(modesFor('地址')).toContain('district');
    expect(modesFor('身份证')).not.toContain('surname');
    expect(firstExample('王小明、欧阳志远')).toBe('王小明');
    expect(sanitizeRetention({ mode: 'ends', head: -1, tail: 0 })).toBeNull();
    expect(sanitizeRetention({ mode: 'delim', delimiter: '@', side: 'after' })).toEqual({ mode: 'delim', delimiter: '@', side: 'after' });
  });
});

describe('partial output', () => {
  const text = `王小明 ${ID1}，${ID2}，手机 138-1234-5678，amy.chen@gmail.com，住 北京市朝阳区建国路88号；王小明再次出现`;

  it('keeps characters outside the marker and records only the hidden part', () => {
    const items = detect(text, SUGGESTED);
    const byOriginal = (o: string) => items.find((i) => i.original === o)!;
    expect(outputFor(byOriginal(ID1))).toMatch(/^11\[身份证:[0-9a-f]{6}\]$/);
    expect(outputFor(byOriginal('138-1234-5678'))).toMatch(/^\[手机:[0-9a-f]{6}\]678$/);
    expect(outputFor(byOriginal('amy.chen@gmail.com'))).toMatch(/^\[邮箱:[0-9a-f]{6}\]@gmail\.com$/);
    expect(outputFor(byOriginal('北京市朝阳区建国路88号'))).toMatch(/^北京市朝阳区\[地址:[0-9a-f]{6}\]$/);
    expect(previewLabel(byOriginal(ID1))).toBe('11[身份证]');
    expect(previewLabel(byOriginal('王小明'))).toBe('王[姓名]');

    const { mapping, redactedText } = applyRedactions(text, items);
    expect(mapping.find((m) => m.category === '身份证' && m.prefix === '11')?.original).toBe('0101199003078515');
    // 不同的完整值 → 不同的编码
    expect(byOriginal(ID1).code).not.toBe(byOriginal(ID2).code);
    // 同一个完整值 → 共用一个编码
    const wang = items.filter((i) => i.original === '王小明');
    expect(wang[0].code).toBe(wang[1].code);

    const csv = serializeMapping(mapping);
    expect(csv.split('\r\n')[0]).toBe('\ufeffcode,category,original,kept_prefix,kept_suffix');
    const parsed = parseMapping(csv);
    expect(parsed.errors).toEqual([]);
    expect(restore(redactedText, parsed.entries).restoredText).toBe(text);
  });

  it('writes the v1 CSV header when nothing is kept', () => {
    const { mapping } = applyRedactions(text, detect(text, BUILTIN_PATTERNS));
    expect(serializeMapping(mapping).split('\r\n')[0]).toBe('\ufeffcode,category,original');
  });

  it('gives a manual item with a different retention its own code, so restore stays exact', () => {
    const t = `${ID1} 与 ${ID1}`;
    const book = new CodeBook();
    const items: RedactionItem[] = detect(t, SUGGESTED, book).filter((i) => i.start === 0);
    const start = t.lastIndexOf(ID1);
    const manual = addManualItem(items, t, start, start + ID1.length, '身份证', book, { mode: 'none' });
    expect(manual.code).not.toBe(items[0].code);
    const { redactedText, mapping } = applyRedactions(t, items);
    expect(redactedText).toMatch(/^11\[身份证:\w{6}\] 与 \[身份证:\w{6}\]$/);
    expect(restore(redactedText, mapping).restoredText).toBe(t);
  });
});

describe('shared and imported codes', () => {
  it('shares one book across documents', () => {
    const book = new CodeBook();
    const a = detect('王小明来电', BUILTIN_PATTERNS, book);
    const b = detect('联系人 王小明 表示', BUILTIN_PATTERNS, book);
    expect(a[0].code).toBe(b.find((i) => i.original === '王小明')!.code);
  });

  it('reuses codes from an imported table by full value and never collides with them', () => {
    const first = detect(`${ID1}、王小明来电`, SUGGESTED);
    const table = parseMapping(serializeMapping(applyRedactions(`${ID1}、王小明来电`, first).mapping)).entries;

    const book = new CodeBook();
    expect(book.seed(table)).toEqual([]);
    const next = detect(`${ID2}、${ID1}、王小明来电`, SUGGESTED, book);
    const a = next.find((i) => i.original === ID1)!;
    const b = next.find((i) => i.original === ID2)!;
    expect(a.code).toBe(first.find((i) => i.original === ID1)!.code);
    expect(table.some((e) => e.code === b.code)).toBe(false);

    const merged = mergeMappings(table, applyRedactions(`${ID2}、${ID1}、王小明来电`, next).mapping);
    expect(merged.length).toBe(table.length + 1);
  });

  it('reads a v1 table (no kept columns) as full values and warns on duplicate values', () => {
    const book = new CodeBook();
    const warnings = book.seed([
      { code: 'aaaaaa', category: '姓名', original: '王小明' },
      { code: 'bbbbbb', category: '姓名', original: '王小明' },
    ]);
    expect(warnings).toHaveLength(1);
    expect(book.codeFor('姓名', '王小明')).toBe('aaaaaa');
  });
});

describe('standard 部分保留 (default output mode)', () => {
  const cases: [string, string, RegExp][] = [
    ['姓名', '王小明', /^王\[姓名:\w{6}\]$/],
    ['姓名', '欧阳志明', /^欧阳\[姓名:\w{6}\]$/],
    ['身份证', ID1, /^11\[身份证:\w{6}\]$/],
    ['手机', '138-1234-5678', /^138\[手机:\w{6}\]$/],
    ['手机', '13812345678', /^138\[手机:\w{6}\]$/],
    ['固定电话', '(010)88886666', /^\(010\)\[固定电话:\w{6}\]$/],
    ['固定电话', '0571-88886666', /^0571-\[固定电话:\w{6}\]$/],
    ['固定电话', '01088886666', /^010\[固定电话:\w{6}\]$/],
    ['地址', '北京市朝阳区建国路88号', /^北京市朝阳区\[地址:\w{6}\]$/],
    ['邮箱', 'amy.chen@gmail.com', /^\[邮箱:\w{6}\]@gmail\.com$/],
    ['单位名称', '北京筑梦科技有限公司', /^\[单位名称:\w{6}\]有限公司$/],
    ['统一社会信用代码', '91110108MA01ABCD2H', /^\[统一社会信用代码:\w{6}\]$/],
    ['银行卡', '6222021234567894', /^\[银行卡:\w{6}\]7894$/],
    ['车牌', '京11010119905', /^京\[车牌:\w{6}\]$/],
    ['出生日期', '1990年3月14日', /^1990年\[出生日期:\w{6}\]$/],
    ['标识符', 'EMP-004521', /^E\[标识符:\w{6}\]$/],
  ];
  it.each(cases)('%s %s keeps only the statistics-friendly part', (category, value, expected) => {
    const items: RedactionItem[] = [];
    const it = addManualItem(items, value, 0, value.length, category as never, new CodeBook(), { mode: 'preview' });
    expect(outputFor(it)).toMatch(expected);
  });
});

describe('resplitItems', () => {
  it('switches between 全部隐藏 and 部分保留 and restores exactly either way', () => {
    const text = `王小明 ${ID1} 138-1234-5678`;
    const book = new CodeBook();
    const items = detect(text, BUILTIN_PATTERNS, book);
    resplitItems(items, book, () => ({ mode: 'preview' }));
    const preview = applyRedactions(text, items);
    expect(preview.redactedText).toMatch(/^王\[姓名:\w{6}\] 11\[身份证:\w{6}\] 138\[手机:\w{6}\]$/);
    expect(restore(preview.redactedText, preview.mapping).restoredText).toBe(text);

    resplitItems(items, book, () => undefined);
    const code = applyRedactions(text, items);
    expect(code.redactedText).toMatch(/^\[姓名:\w{6}\] \[身份证:\w{6}\] \[手机:\w{6}\]$/);
    expect(items.every((i) => !i.head && !i.tail)).toBe(true);
    expect(restore(code.redactedText, code.mapping).restoredText).toBe(text);
  });
});

describe('setCategoryRetention (设为默认)', () => {
  it('writes one retention to every rule of the category and clears it with 全部隐藏', async () => {
    const { setCategoryRetention, getEffectivePatterns } = await import('../../src/core/pattern-store');
    const base = { version: 1 as const, disabledBuiltins: [], customPatterns: [{ id: 'c-1', name: '员编', category: '身份证' as const, regex: 'EMP\\d+', example: 'EMP1', enabled: true }] };
    const set = setCategoryRetention(base, '身份证', { mode: 'ends', head: 2, tail: 0 });
    const ids = getEffectivePatterns(set).filter((p) => p.category === '身份证').map((p) => p.retention);
    expect(ids).toEqual([{ mode: 'ends', head: 2, tail: 0 }, { mode: 'ends', head: 2, tail: 0 }]);
    expect(getEffectivePatterns(set).find((p) => p.category === '姓名')!.retention).toBeUndefined();
    const cleared = setCategoryRetention(set, '身份证', { mode: 'none' });
    expect(cleared.retention).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import { CodeBook, parseMarkers } from '../../src/core/codes';
import { detect, resplitItems } from '../../src/core/detector';
import { applyRedactions, blankOut, outputFor, previewLabel } from '../../src/core/redactor';
import { restore } from '../../src/core/restorer';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';

const text = '王小明 138-1234-5678，amy.chen@gmail.com，住 北京市朝阳区建国路88号';

/** The sample detected and split under 部分保留 (preview) or 全部隐藏 (undefined). */
function itemsFor(partial: boolean) {
  const book = new CodeBook();
  const items = detect(text, BUILTIN_PATTERNS, book);
  resplitItems(items, book, () => (partial ? { mode: 'preview' } : undefined));
  return items;
}
const byOriginal = (items: ReturnType<typeof itemsFor>, o: string) => items.find((i) => i.original === o)!;

describe('blankOut', () => {
  it('turns each letter and digit into ○ and keeps separators', () => {
    expect(blankOut('王小明')).toBe('○○○');
    expect(blankOut('138-1234-5678')).toBe('○○○-○○○○-○○○○');
    expect(blankOut('amy.chen@gmail.com')).toBe('○○○.○○○○@○○○○○.○○○');
    expect(blankOut('(010) 8888-6666')).toBe('(○○○) ○○○○-○○○○');
  });
});

describe('marker styles', () => {
  it('writes the hidden part as a code, the category or ○ under 部分保留', () => {
    const items = itemsFor(true);
    const wang = byOriginal(items, '王小明');
    const phone = byOriginal(items, '138-1234-5678');
    const mail = byOriginal(items, 'amy.chen@gmail.com');
    expect(outputFor(wang)).toMatch(/^王\[姓名:[0-9a-f]{6}\]$/);
    expect(outputFor(wang, 'label')).toBe('王[姓名]');
    expect(outputFor(wang, 'blank')).toBe('王○○');
    expect(outputFor(phone, 'blank')).toBe('138-○○○○-○○○○');
    expect(outputFor(mail, 'label')).toBe('[邮箱]@gmail.com');
    expect(outputFor(mail, 'blank')).toBe('○○○.○○○○@gmail.com');
  });

  it('hides whole values under 全部隐藏, ○ for every letter and digit', () => {
    const items = itemsFor(false);
    expect(outputFor(byOriginal(items, '138-1234-5678'), 'blank')).toBe('○○○-○○○○-○○○○');
    expect(outputFor(byOriginal(items, '北京市朝阳区建国路88号'), 'blank')).toBe('○'.repeat(12));
    expect(outputFor(byOriginal(items, '王小明'), 'label')).toBe('[姓名]');
  });

  it('previews exactly the output, except that a code shows as its category', () => {
    const wang = byOriginal(itemsFor(true), '王小明');
    expect(previewLabel(wang)).toBe('王[姓名]');
    expect(previewLabel(wang, 'label')).toBe('王[姓名]');
    expect(previewLabel(wang, 'blank')).toBe('王○○');
  });

  it('writes no code and no mapping table when restoring is not needed', () => {
    for (const style of ['label', 'blank'] as const) {
      const { redactedText, mapping, edits } = applyRedactions(text, itemsFor(true), style);
      expect(parseMarkers(redactedText)).toEqual([]);
      expect(mapping).toEqual([]);
      expect(edits.length).toBe(4);
      expect(redactedText).not.toContain('小明');
      expect(redactedText).not.toContain('345');
    }
    expect(applyRedactions(text, itemsFor(true), 'blank').redactedText).toBe('王○○ 138-○○○○-○○○○，○○○.○○○○@gmail.com，住 北京市朝阳区○○○○○○');
  });

  it('keeps the code style restorable, as before', () => {
    const { redactedText, mapping } = applyRedactions(text, itemsFor(true));
    expect(restore(redactedText, mapping).restoredText).toBe(text);
  });
});

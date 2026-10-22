import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { uniqueNamer, manifestCsv, buildArchive, type BatchEntry } from '../../src/formats/batch';
import { detect } from '../../src/core/detector';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { parseMapping } from '../../src/core/csv';
import { restore } from '../../src/core/restorer';
import { parsePlainText } from '../../src/formats/plaintext';
import { parseDocx } from '../../src/formats/docx';
import { parseXlsx } from '../../src/formats/xlsx';
import { buildDocx, toFile, SAMPLE_DOCX_SPEC } from '../helpers/docx-builder';
import { buildXlsx, toXlsxFile, SAMPLE_XLSX_SPEC } from '../helpers/xlsx-builder';

const SAMPLE_TXT_PATH = 'tests/fixtures/sample.txt';

async function entryFromText(fileName: string, text: string): Promise<BatchEntry> {
  const doc = await parsePlainText(new File([text], fileName), 'txt');
  const items = detect(doc.text, BUILTIN_PATTERNS);
  return { doc, items };
}

describe('uniqueNamer', () => {
  it('returns the first occurrence of a name unchanged', () => {
    const unique = uniqueNamer();
    expect(unique('a.txt')).toBe('a.txt');
  });

  it('appends " (2)", " (3)"... before the extension for repeats', () => {
    const unique = uniqueNamer();
    expect(unique('a.txt')).toBe('a.txt');
    expect(unique('a.txt')).toBe('a (2).txt');
    expect(unique('a.txt')).toBe('a (3).txt');
  });

  it('appends the counter directly (no extension) when the name has none', () => {
    const unique = uniqueNamer();
    expect(unique('README')).toBe('README');
    expect(unique('README')).toBe('README (2)');
  });

  it('leaves different names untouched', () => {
    const unique = uniqueNamer();
    expect(unique('a.txt')).toBe('a.txt');
    expect(unique('b.txt')).toBe('b.txt');
    expect(unique('c.docx')).toBe('c.docx');
  });
});

describe('manifestCsv', () => {
  it('starts with a BOM', () => {
    expect(manifestCsv([]).charCodeAt(0)).toBe(0xfeff);
    expect(manifestCsv([]).startsWith('﻿')).toBe(true);
  });

  it('has the expected header', () => {
    const csv = manifestCsv([]);
    expect(csv.slice(1)).toContain('文件,去标识化档,编码表,生效笔数');
  });

  it('uses CRLF line endings throughout', () => {
    const csv = manifestCsv([
      { source: 'a.txt', output: 'a.deid.txt', mapping: 'a.mapping.csv', count: 1 },
      { source: 'b.txt', output: 'b.deid.txt', mapping: 'b.mapping.csv', count: 2 },
    ]);
    // Every line break is a CRLF pair, never a lone \n.
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
    expect(csv.replace(/\r\n/g, '')).not.toContain('\r');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('quotes a source name containing a comma per RFC 4180', () => {
    const csv = manifestCsv([{ source: 'a,b.txt', output: 'a,b.deid.txt', mapping: 'a,b.mapping.csv', count: 3 }]);
    const dataLine = csv.slice(1).split('\r\n')[1];
    expect(dataLine).toBe('"a,b.txt","a,b.deid.txt","a,b.mapping.csv",3');
  });
});

describe('buildArchive', () => {
  it('writes the documents only, without any mapping table, when restoring is not needed', async () => {
    const entries = [
      await entryFromText('a.txt', '客户林美玲，电话 13900001111。'),
      await entryFromText('b.txt', '联系邮箱：mei.lin@example.com。'),
    ];
    const merged = [{ code: 'abcdef', category: '姓名', original: '林美玲' }];
    for (const style of ['label', 'blank'] as const) {
      const { blob, manifest } = await buildArchive(entries, merged, style);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      expect(Object.keys(zip.files).sort()).toEqual(['a.deid.txt', 'b.deid.txt', '清单.csv']);
      expect(manifest.every((r) => r.mapping === '')).toBe(true);
      const list = await zip.file('清单.csv')!.async('string');
      expect(list).toContain('文件,去标识化档,生效笔数');
      expect(list).not.toContain('编码表');
      const out = await zip.file('a.deid.txt')!.async('string');
      expect(out).not.toMatch(/\[[^\]]+:[0-9a-f]{6}\]/);
      expect(out).toContain(style === 'label' ? '[手机]' : '○○○');
    }
  });

  it('packs four entries (one with a colliding mapping name) into a 9-file archive with a correct manifest', async () => {
    const sampleTxt = readFileSync(SAMPLE_TXT_PATH, 'utf-8');
    const quoteTxt =
      '报价单编号：Q-2026-001\n' +
      '客户：林美玲女士，电话 13900001111，地址北京市朝阳区建国路88号。\n' +
      '联络信箱：mei.lin@example.com。\n';

    const txtEntry = await entryFromText('sample.txt', sampleTxt);
    const docxDoc = await parseDocx(toFile(await buildDocx(SAMPLE_DOCX_SPEC), '报价单.docx'));
    const docxEntry: BatchEntry = { doc: docxDoc, items: detect(docxDoc.text, BUILTIN_PATTERNS) };
    const xlsxDoc = await parseXlsx(toXlsxFile(await buildXlsx(SAMPLE_XLSX_SPEC), '客户数据.xlsx'));
    const xlsxEntry: BatchEntry = { doc: xlsxDoc, items: detect(xlsxDoc.text, BUILTIN_PATTERNS) };
    const quoteEntry = await entryFromText('报价单.txt', quoteTxt);

    const entries = [txtEntry, docxEntry, xlsxEntry, quoteEntry];
    for (const e of entries) expect(e.items.filter((i) => i.active).length).toBeGreaterThan(0);

    const { blob, manifest } = await buildArchive(entries);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).sort();

    expect(names.length).toBe(9);
    expect(manifest.length).toBe(4);

    // Expected manifest rows, in entry order.
    expect(manifest[0]).toMatchObject({ source: 'sample.txt', output: 'sample.deid.txt', mapping: 'sample.mapping.csv' });
    expect(manifest[1]).toMatchObject({
      source: '报价单.docx',
      output: '报价单.deid.docx',
      mapping: '报价单.mapping.csv',
    });
    expect(manifest[2]).toMatchObject({
      source: '客户数据.xlsx',
      output: '客户数据.deid.xlsx',
      mapping: '客户数据.mapping.csv',
    });
    // '报价单.txt' gets a distinct output name from '报价单.docx' (different extension),
    // but its mapping name collides with the docx entry's and must be disambiguated.
    expect(manifest[3]).toMatchObject({
      source: '报价单.txt',
      output: '报价单.deid.txt',
      mapping: '报价单.mapping (2).csv',
    });

    expect(names).toEqual(
      [
        'sample.deid.txt',
        'sample.mapping.csv',
        '报价单.deid.docx',
        '报价单.mapping.csv',
        '客户数据.deid.xlsx',
        '客户数据.mapping.csv',
        '报价单.deid.txt',
        '报价单.mapping (2).csv',
        '清单.csv',
      ].sort(),
    );

    // Per-entry checks: mapping row count, mapping CSV parses cleanly, output contains
    // every marker and none of the active originals, and (for the txt entries) restoring
    // the output with its mapping reproduces the original text exactly.
    for (const [i, entry] of entries.entries()) {
      const row = manifest[i];
      const activeItems = entry.items.filter((it) => it.active);
      expect(row.count).toBe(activeItems.length);

      const mappingText = await zip.file(row.mapping)!.async('string');
      const { entries: mappingEntries, errors } = parseMapping(mappingText);
      expect(errors).toEqual([]);
      expect(mappingEntries.length).toBe(new Set(activeItems.map((it) => it.code)).size);

      const outBytes = await zip.file(row.output)!.async('uint8array');
      let outText: string;
      if (entry.doc.format === 'txt') {
        const outDoc = await parsePlainText(new File([outBytes as BlobPart], row.output), 'txt');
        outText = outDoc.text;
      } else if (entry.doc.format === 'docx') {
        const outDoc = await parseDocx(new File([outBytes as BlobPart], row.output));
        outText = outDoc.text;
      } else {
        const outDoc = await parseXlsx(new File([outBytes as BlobPart], row.output));
        outText = outDoc.text;
      }

      for (const m of mappingEntries) {
        expect(outText).toContain(`[${m.category}:${m.code}]`);
      }
      for (const item of activeItems) {
        expect(outText.includes(item.original)).toBe(false);
      }

      if (entry.doc.format === 'txt') {
        const restored = restore(outText, mappingEntries);
        expect(restored.missingCodes).toEqual([]);
        expect(restored.restoredText).toBe(entry.doc.text);
      }
    }
  });

  it('still produces an output file and an empty (header-only) mapping csv for an entry with zero active items', async () => {
    const entry = await entryFromText('empty.txt', 'Hello world, this is a plain test file with no personal data at all.');
    expect(entry.items.length).toBe(0);

    const { blob, manifest } = await buildArchive([entry]);
    expect(manifest).toEqual([
      { source: 'empty.txt', output: 'empty.deid.txt', mapping: 'empty.mapping.csv', count: 0 },
    ]);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('empty.deid.txt')!.async('string')).toBe(entry.doc.text);

    const mappingText = await zip.file('empty.mapping.csv')!.async('string');
    const { entries, errors } = parseMapping(mappingText);
    expect(errors).toEqual([]);
    expect(entries).toEqual([]);
    // Header-only: BOM + header line + trailing CRLF, no data rows.
    expect(mappingText).toBe('﻿code,category,original\r\n');
  });

  it('writes 清单.csv equal to manifestCsv(manifest)', async () => {
    const entry = await entryFromText('a.txt', '客户 陈大文 的电话是 138-1234-5678。');
    const { blob, manifest } = await buildArchive([entry]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const listCsv = await zip.file('清单.csv')!.async('string');
    expect(listCsv).toBe(manifestCsv(manifest));
  });
});

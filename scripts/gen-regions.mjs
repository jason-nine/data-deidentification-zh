// Generates src/core/rules/zh-CN-regions.ts from a public administrative-division dataset.
// Source: https://github.com/modood/Administrative-divisions-of-China (derived from 国家统计局区划代码)
// Usage: node scripts/gen-regions.mjs <pca-code.json>
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/gen-regions.mjs <pca-code.json>');
const data = JSON.parse(readFileSync(src, 'utf8'));

const provinces = [];
const cities = [];
for (const p of data) {
  provinces.push(p.name);
  for (const c of p.children ?? []) {
    // Skip pseudo levels: municipalities' 市辖区/县 and the "省直辖县级行政区划" placeholders.
    if (c.name === '市辖区' || c.name === '县' || c.name.endsWith('县级行政区划')) continue;
    cities.push(c.name);
  }
}
// The dataset stops at the mainland; the tool still needs to recognise these.
for (const extra of ['香港特别行政区', '澳门特别行政区', '台湾省']) if (!provinces.includes(extra)) provinces.push(extra);

const uniq = (a) => [...new Set(a)];
const list = (a) => a.map((s) => `  '${s}',`).join('\n');

const out = `// 中国大陆行政区划名称（省 / 地级），用于地址锚定与姓名负向过滤。
// 由 scripts/gen-regions.mjs 生成，请勿手工编辑。
// 数据来源：国家统计局区划代码，经 github.com/modood/Administrative-divisions-of-China 整理。
// 区县与乡镇不内置：短地址由「区/县 + 路/街 + 门牌号」结构兜底（见 patterns.ts）。
// 生成日期：${new Date().toISOString().slice(0, 10)}

/** 省级行政区（34）。 */
export const PROVINCES: readonly string[] = [
${list(uniq(provinces))}
];

/** 地级行政区（市 / 自治州 / 地区 / 盟）。 */
export const CITIES: readonly string[] = [
${list(uniq(cities))}
];

/** 省级 + 地级名称集合，用于 O(1) 判定「这串字是不是地名」。 */
export const REGION_NAMES: ReadonlySet<string> = new Set([...PROVINCES, ...CITIES]);

/** 名称去掉行政后缀后的词干，用于「北京」「杭州」这类省略后缀的写法。 */
export function regionStem(name: string): string {
  return name.replace(/(?:特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|自治县|地区|省|市|盟|区|县|旗)$/u, '');
}
`;
writeFileSync('src/core/rules/zh-CN-regions.ts', out);
console.log(`provinces=${uniq(provinces).length} cities=${uniq(cities).length}`);

import type { Category, Retention } from './types';
import { CITY_ALT, COMPOUND_SURNAMES, PROVINCE_ALT } from './patterns';
import { COMPANY_MASK_RE } from './mask';
import { birthYearSplit, phonePrefixLength } from './intl';

export type RetentionMode = Retention['mode'];

export interface Split {
  head: number;
  tail: number;
}

const NONE: Split = { head: 0, tail: 0 };
const PROVINCE_RE = new RegExp(`^${PROVINCE_ALT}`, 'u');
const CITY_RE = new RegExp(`^${CITY_ALT}`, 'u');
const DISTRICT_RE = /^[一-龥]{2,6}?(?:新区|区|县|旗|市)/u;

export function modesFor(category: Category): RetentionMode[] {
  const modes: RetentionMode[] = ['none', 'ends', 'delim'];
  if (category === '姓名') modes.push('surname');
  if (category === '地址') modes.push('city', 'district');
  modes.push('preview');
  return modes;
}

export const MODE_LABELS: Record<RetentionMode, string> = {
  none: '全部隐藏',
  ends: '保留前／后几位',
  delim: '以分隔符为界',
  surname: '保留姓氏',
  city: '保留到省',
  district: '保留到省＋市',
  preview: '部分保留（标准）',
};

export function describeRetention(r: Retention | undefined): string {
  if (!r) return MODE_LABELS.none;
  switch (r.mode) {
    case 'ends': {
      const parts = [r.head > 0 ? `前 ${r.head} 位` : '', r.tail > 0 ? `后 ${r.tail} 位` : ''].filter(Boolean);
      return parts.length ? `保留${parts.join('＋')}` : MODE_LABELS.none;
    }
    case 'delim':
      return `保留「${r.delimiter}」${r.side === 'after' ? '之后' : '之前'}`;
    default:
      return MODE_LABELS[r.mode];
  }
}

/** 第 n 位数字之后的下标，连同其后紧跟的分隔符一起算进去。 */
function afterDigit(value: string, n: number): number {
  let seen = 0;
  for (let i = 0; i < value.length; i++) {
    if (/\d/.test(value[i]) && ++seen === n) {
      let j = i + 1;
      while (j < value.length && !/\d/.test(value[j])) j++;
      return j;
    }
  }
  return value.length;
}

/**
 * 标准的「部分保留」：只露出对统计有用、对再识别作用弱的片段
 * （姓氏、身份证省级码、手机号段、区号、省＋市、邮箱域名、组织形式、卡号后四位、出生年份）。
 * 统一社会信用代码与 SSN 全部隐藏。
 */
export function standardSplit(category: Category, value: string): Split {
  switch (category) {
    case '姓名':
      return { head: COMPOUND_SURNAMES.some((s) => value.startsWith(s)) ? 2 : 1, tail: 0 };
    case '身份证':
      return { head: 2, tail: 0 };
    case '护照':
      return NONE;
    case '手机':
      return { head: 3, tail: 0 };
    case '固定电话': {
      const area = value.match(/^(?:\+?86[-\s]?)?(?:\(0\d{2,3}\)|0\d{2,3}[-\s])/)?.[0];
      return { head: area ? area.length : afterDigit(value, 3), tail: 0 };
    }
    case '地址':
      return rawSplit(value, { mode: 'district' }, category);
    case '邮箱': {
      const at = value.indexOf('@');
      return at > 0 ? { head: 0, tail: value.length - at } : NONE;
    }
    case '单位名称': {
      const m = value.match(COMPANY_MASK_RE);
      return m ? { head: 0, tail: m[3].length } : NONE;
    }
    case '统一社会信用代码':
    case 'SSN':
      return NONE;
    case '银行卡':
    case '信用卡': {
      let start = value.length;
      for (let digits = 0; start > 0 && digits < 4; ) if (/\d/.test(value[--start])) digits++;
      return { head: 0, tail: value.length - start };
    }
    case '车牌':
      return { head: 1, tail: 0 };
    case '国际电话':
      return { head: phonePrefixLength(value), tail: 0 };
    case 'IBAN':
      return { head: 2, tail: 0 };
    case 'IP':
      return { head: value.match(/^(?:\d{1,3}\.){2}|^(?:[0-9a-f]{0,4}:){2}/i)?.[0].length ?? 0, tail: 0 };
    case '出生日期':
      return birthYearSplit(value);
    default:
      return { head: 1, tail: 0 };
  }
}

function rawSplit(value: string, r: Retention, category: Category): Split {
  switch (r.mode) {
    case 'none':
      return NONE;
    case 'preview':
      return standardSplit(category, value);
    case 'ends':
      return { head: r.head, tail: r.tail };
    case 'delim': {
      if (!r.delimiter) return NONE;
      if (r.side === 'after') {
        const i = value.indexOf(r.delimiter);
        return i < 0 ? NONE : { head: 0, tail: value.length - i };
      }
      const i = value.lastIndexOf(r.delimiter);
      return i < 0 ? NONE : { head: i + r.delimiter.length, tail: 0 };
    }
    case 'surname':
      return { head: COMPOUND_SURNAMES.some((s) => value.startsWith(s)) ? 2 : 1, tail: 0 };
    case 'city':
    case 'district':
      return { head: addressPrefix(value, r.mode), tail: 0 };
  }
}

/**
 * 地址保留到哪一级：省 → 省＋市。没有省名时按市名起算；
 * 直辖市（省即市）直接算到区县。
 */
function addressPrefix(value: string, mode: 'city' | 'district'): number {
  const province = value.match(PROVINCE_RE)?.[0] ?? '';
  if (province) {
    if (mode === 'city') return province.length;
    const rest = value.slice(province.length);
    const city = cityOf(rest);
    if (city) return province.length + city.length;
    return province.length + (rest.match(DISTRICT_RE)?.[0]?.length ?? 0);
  }
  const city = cityOf(value);
  if (!city) return 0;
  if (mode === 'city') return city.length;
  return city.length + (value.slice(city.length).match(DISTRICT_RE)?.[0]?.length ?? 0);
}

/**
 * 取开头的市名。地名与市名同字时会误判（「朝阳区」的朝阳也是辽宁朝阳市），
 * 所以市名后面紧跟「区／县／旗」的一律按区县处理。
 */
function cityOf(value: string): string {
  const city = value.match(CITY_RE)?.[0] ?? '';
  return city && /^[区县旗]/u.test(value.slice(city.length)) ? '' : city;
}

/** 首尾各保留几个字；除非至少还藏着一个字，否则退回全部隐藏。 */
export function splitFor(value: string, r: Retention | undefined, category: Category = '标识符'): Split {
  if (!r) return NONE;
  const s = rawSplit(value, r, category);
  if (s.head < 0 || s.tail < 0 || s.head + s.tail >= value.length) return NONE;
  return s;
}

/** 规则示例里的第一个值（示例可能列了多个，用「、」分隔）。 */
export function firstExample(example: string): string {
  return example.split(/[、,，]/)[0].trim();
}

export interface RetentionCheck {
  error: string | null;
  warnings: string[];
}

/** 用规则的示例值校验部分保留设置是否合理（FR-013–FR-015）。 */
export function checkRetention(example: string, r: Retention, category: Category = '标识符'): RetentionCheck {
  const warnings: string[] = [];
  if (r.mode === 'preview') warnings.push('部分保留会露出部分字符（例如身份证前 2 位、手机前 3 位），并非完全匿名。');
  if (r.mode === 'ends') {
    if (!Number.isInteger(r.head) || !Number.isInteger(r.tail) || r.head < 0 || r.tail < 0) return { error: '保留位数必须是 0 以上的整数', warnings };
    if (r.head > 0 && r.tail > 0) warnings.push('前后同时保留，配合其他字段时更容易识别出个人。');
  }
  if (r.mode === 'delim' && !r.delimiter) return { error: '请输入分隔符', warnings };
  if (r.mode !== 'ends' && r.mode !== 'delim' && r.mode !== 'preview') return { error: null, warnings };

  const ex = firstExample(example);
  if (!ex) return { error: null, warnings };
  if (r.mode === 'delim' && !ex.includes(r.delimiter)) {
    warnings.push(`示例「${ex}」中没有「${r.delimiter}」，这类值会全部隐藏。`);
    return { error: null, warnings };
  }
  const raw = rawSplit(ex, r, category);
  const hidden = ex.length - raw.head - raw.tail;
  if (r.mode === 'preview') return { error: null, warnings };
  if (hidden <= 0) return { error: `这个设置会把示例「${ex}」整个保留下来，至少要隐藏 1 个字符。`, warnings };
  if (hidden < ex.length / 2) warnings.push(`示例「${ex}」只隐藏 ${hidden} / ${ex.length} 个字符（不到一半），重新识别的风险较高。`);
  return { error: null, warnings };
}

/** 只接受格式正确的 retention 对象（从 localStorage 读回时用）。 */
export function sanitizeRetention(x: unknown): Retention | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  switch (r.mode) {
    case 'none':
    case 'surname':
    case 'city':
    case 'district':
    case 'preview':
      return { mode: r.mode };
    case 'ends':
      return Number.isInteger(r.head) && Number.isInteger(r.tail) && (r.head as number) >= 0 && (r.tail as number) >= 0
        ? { mode: 'ends', head: r.head as number, tail: r.tail as number }
        : null;
    case 'delim':
      return typeof r.delimiter === 'string' && r.delimiter && (r.side === 'before' || r.side === 'after')
        ? { mode: 'delim', delimiter: r.delimiter, side: r.side }
        : null;
    default:
      return null;
  }
}

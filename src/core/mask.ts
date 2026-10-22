import type { Category } from './types';
import { COMPOUND_SURNAMES, COMPANY_SUFFIX_SRC } from './patterns';

/** 单位名拆成（前两字）（中间）（组织形式）；与预览态的部分保留共用。 */
export const COMPANY_MASK_RE = new RegExp(`^(.{2})(.*?)(${COMPANY_SUFFIX_SRC})$`, 'u');

function keepEnds(s: string, head: number, tail: number, fill = '*'): string {
  if (s.length <= head + tail) return fill.repeat(s.length);
  return s.slice(0, head) + fill.repeat(s.length - head - tail) + s.slice(s.length - tail);
}

/** 地址开头的行政区划段（最多省、市、区三级），用于预览时保留到区县。 */
const ADMIN_SEGMENT = /^[\u4e00-\u9fa5]{2,8}?(?:特别行政区|自治区|自治州|地区|省|市|盟|区|县|旗)/u;

function adminPrefix(address: string): string {
  let prefix = '';
  let rest = address;
  for (let i = 0; i < 3; i++) {
    const m = rest.match(ADMIN_SEGMENT);
    if (!m) break;
    prefix += m[0];
    rest = rest.slice(m[0].length);
  }
  return prefix;
}

/**
 * 预览用的可读掩码（只影响界面显示）。
 * 下载的文件一律使用 `[类别:编码]` 标记（见 contracts/marker-format.md）。
 */
export function maskDisplay(category: Category, original: string): string {
  switch (category) {
    case '姓名': {
      const surnameLen = COMPOUND_SURNAMES.some((s) => original.startsWith(s)) ? 2 : 1;
      if (original.length <= surnameLen) return 'O'.repeat(Math.max(2, original.length));
      return original.slice(0, surnameLen) + 'O'.repeat(original.length - surnameLen);
    }
    case '身份证':
      return keepEnds(original, 3, 2);
    case '护照':
      return keepEnds(original, 1, 0);
    case '手机': {
      const digits = original.replace(/\D/g, '').replace(/^86/, '');
      if (digits.length === 11) return `${digits.slice(0, 3)}****${digits.slice(7)}`;
      return keepEnds(original, 3, 2);
    }
    case '固定电话': {
      const digits = original.replace(/\D/g, '');
      if (digits.length >= 10) return `${digits.slice(0, 4)}-****-${digits.slice(-2)}`;
      return keepEnds(original, 2, 2);
    }
    case '地址': {
      const prefix = adminPrefix(original);
      return prefix.length > 0 && prefix.length < original.length ? `${prefix}***` : keepEnds(original, 3, 0);
    }
    case '邮箱': {
      const at = original.indexOf('@');
      if (at > 0) return `${original.slice(0, Math.min(2, at))}***${original.slice(at)}`;
      return keepEnds(original, 2, 0);
    }
    case '单位名称': {
      const m = original.match(COMPANY_MASK_RE);
      if (m) return m[2] ? `${m[1]}**${m[3]}` : `${m[1][0]}*${m[3]}`;
      return keepEnds(original, 2, 0);
    }
    case '统一社会信用代码':
      return keepEnds(original, 2, 1);
    case '银行卡':
      return keepEnds(original, 0, 4);
    case '车牌':
      return keepEnds(original, 1, 0);
    case '出生日期': {
      const year = original.match(/^\d{4}/)?.[0];
      return year ? `${year}-**-**` : keepEnds(original, 4, 0);
    }
    case '标识符':
    default:
      return keepEnds(original, 3, 0);
  }
}

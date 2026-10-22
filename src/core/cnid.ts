// 中国大陆证件与机构代码的校验算法（GB 11643 公民身份号码、GB 32100 统一社会信用代码）。

/** 18 位身份证的加权因子与校验码表（GB 11643-1999，ISO 7064 MOD 11-2）。 */
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = '10X98765432';

/** 出生日期段是否真实存在（1900–2099），用于剔除随机数字串。 */
function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2099 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

/**
 * 18 位居民身份证：校验位 + 出生日期段双重验证。
 * 15 位旧证（1999 年前签发）无校验位，只验证出生日期段。
 */
export function isValidCnId(id: string): boolean {
  if (/^\d{17}[\dXx]$/.test(id)) {
    const y = Number(id.slice(6, 10));
    const m = Number(id.slice(10, 12));
    const d = Number(id.slice(12, 14));
    if (!isRealDate(y, m, d)) return false;
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += Number(id[i]) * ID_WEIGHTS[i];
    return ID_CHECK[sum % 11] === id[17].toUpperCase();
  }
  if (/^\d{15}$/.test(id)) {
    const y = 1900 + Number(id.slice(6, 8));
    const m = Number(id.slice(8, 10));
    const d = Number(id.slice(10, 12));
    return isRealDate(y, m, d);
  }
  return false;
}

/** 统一社会信用代码字符集：31 个字符，不含易混淆的 I、O、S、V、Z（GB 32100-2015）。 */
const USCC_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const USCC_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

/**
 * 18 位统一社会信用代码：前 17 位的加权和模 31，取补数得到第 18 位。
 * 同时要求首位是登记管理部门码（1 机构编制、5 民政、9 工商、Y 其他）。
 */
export function isValidUscc(code: string): boolean {
  if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(code)) return false;
  if (!'159Y'.includes(code[0])) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += USCC_CHARS.indexOf(code[i]) * USCC_WEIGHTS[i];
  const check = (31 - (sum % 31)) % 31;
  return USCC_CHARS[check] === code[17];
}

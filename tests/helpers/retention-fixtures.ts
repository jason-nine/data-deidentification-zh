import type { Retention } from '../../src/core/types';

/** 测试用的典型按规则保留设置（身份证前 2 位、手机后 3 位…）。 */
export const SUGGESTED_RETENTION: Record<string, Retention> = {
  'zh-name': { mode: 'surname' },
  'cn-id': { mode: 'ends', head: 2, tail: 0 },
  'cn-mobile': { mode: 'ends', head: 0, tail: 3 },
  email: { mode: 'delim', delimiter: '@', side: 'after' },
  'cn-address': { mode: 'district' },
};

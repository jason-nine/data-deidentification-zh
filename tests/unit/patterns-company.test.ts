import { describe, it, expect } from 'vitest';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { detect } from '../../src/core/detector';
import type { Pattern } from '../../src/core/types';

function getPattern(id: string): Pattern {
  const p = BUILTIN_PATTERNS.find((p) => p.id === id);
  if (!p) throw new Error(`pattern not found: ${id}`);
  return p;
}

function matches(id: string, text: string): string[] {
  return detect(text, [getPattern(id)]).map((i) => i.original);
}

describe('cn-company 单位名称', () => {
  it('命中股份有限公司与有限责任公司', () => {
    expect(matches('cn-company', '筑梦实业股份有限公司')).toEqual(['筑梦实业股份有限公司']);
    expect(matches('cn-company', '云图网络科技有限责任公司')).toEqual(['云图网络科技有限责任公司']);
  });

  it('命中诊所、事务所、学校、银行支行', () => {
    expect(matches('cn-company', '大安联合诊所')).toEqual(['大安联合诊所']);
    expect(matches('cn-company', '金诚律师事务所')).toEqual(['金诚律师事务所']);
    expect(matches('cn-company', '浙江树人学院')).toEqual(['浙江树人学院']);
    expect(matches('cn-company', '中国工商银行北京中关村支行')).toEqual(['中国工商银行北京中关村支行']);
  });

  it('「小学」「中学」不在内建后缀里（否则「他上小学」会被误判），需自定义规则', () => {
    expect(matches('cn-company', '他上小学了')).toEqual([]);
    expect(matches('cn-company', '杭州市文一街小学')).toEqual([]);
  });

  it('命中带分公司的完整名称', () => {
    expect(matches('cn-company', '深圳前海数据服务有限公司北京分公司')).toEqual([
      '深圳前海数据服务有限公司北京分公司',
    ]);
  });

  it('在正文里只取单位名，不含「甲方：」这类标签', () => {
    expect(matches('cn-company', '甲方：筑梦实业股份有限公司（统一社会信用代码 91110108MA01ABCD2H）')).toEqual([
      '筑梦实业股份有限公司',
    ]);
  });

  it('不含前置虚词「由」', () => {
    expect(matches('cn-company', '由嘉宏信息股份有限公司提供')).toEqual(['嘉宏信息股份有限公司']);
  });

  it('名字里带「同」「据」等排除字也能完整命中', () => {
    // 回归：排除字曾经逐字生效，导致「大同」「数据」把名字切断。
    expect(matches('cn-company', '大同科技有限公司')).toEqual(['大同科技有限公司']);
    expect(matches('cn-company', '北京数据服务有限公司')).toEqual(['北京数据服务有限公司']);
  });

  it('「本公司」「该公司」「公司电话」不算单位名', () => {
    expect(matches('cn-company', '本公司')).toEqual([]);
    expect(matches('cn-company', '该公司')).toEqual([]);
    expect(matches('cn-company', '公司电话')).toEqual([]);
  });

  it('只有组织形式、前面没有名字时不命中', () => {
    expect(matches('cn-company', '有限公司')).toEqual([]);
  });
});

describe('cn-uscc 与 cn-id 不互相抢', () => {
  it('同一段文字里身份证与统一社会信用代码各归各类', () => {
    const text = '身份证 110101199003078515，统一社会信用代码 91110108MA01ABCD2H';
    const items = detect(text, BUILTIN_PATTERNS);
    expect(items.filter((i) => i.category === '身份证').map((i) => i.original)).toEqual(['110101199003078515']);
    expect(items.filter((i) => i.category === '统一社会信用代码').map((i) => i.original)).toEqual([
      '91110108MA01ABCD2H',
    ]);
  });
});

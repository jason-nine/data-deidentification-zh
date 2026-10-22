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

/** 校验码正确的测试值（由 GB 11643 / GB 32100 / Luhn 算出）。 */
const ID = '110101199003078515';
const ID_X = '11010119900307811X';
const ID_OLD = '110101900307851';
const USCC = '91110108MA01ABCD2H';
const USCC2 = '91310115MA1K3XYQ7L';
const CARD16 = '6222021234567894';

describe('内建规则清单', () => {
  it('包含大陆格式与国际格式的核心规则', () => {
    const ids = BUILTIN_PATTERNS.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'zh-name', 'cn-id', 'cn-mobile', 'cn-landline', 'cn-address', 'cn-company',
        'cn-uscc', 'cn-bank-card', 'cn-plate', 'cn-passport', 'email', 'intl-phone',
        'credit-card', 'iban', 'ipv4', 'ipv6', 'dob',
      ]),
    );
  });

  it('不再包含台湾规则', () => {
    const ids = BUILTIN_PATTERNS.map((p) => p.id);
    expect(ids).not.toContain('tw-id');
    expect(ids).not.toContain('tw-mobile');
    expect(ids).not.toContain('tw-address');
    expect(ids).not.toContain('tw-tax-id');
  });

  it('每条规则的正则都能编译', () => {
    for (const p of BUILTIN_PATTERNS) {
      expect(() => new RegExp(p.regex, 'gu')).not.toThrow();
    }
  });
});

describe('cn-id 居民身份证号', () => {
  it('命中校验位正确的 18 位号码', () => {
    expect(matches('cn-id', `身份证 ${ID} 已核对`)).toEqual([ID]);
  });

  it('命中末位为 X 的号码', () => {
    expect(matches('cn-id', ID_X)).toEqual([ID_X]);
  });

  it('末位小写 x 也命中', () => {
    expect(matches('cn-id', ID_X.toLowerCase())).toEqual([ID_X.toLowerCase()]);
  });

  it('命中 15 位旧证', () => {
    expect(matches('cn-id', `旧证 ${ID_OLD}`)).toEqual([ID_OLD]);
  });

  it('校验位错误不命中', () => {
    expect(matches('cn-id', '110101199003078516')).toEqual([]);
  });

  it('出生日期不存在不命中（2 月 30 日）', () => {
    expect(matches('cn-id', '110101199002308515')).toEqual([]);
  });

  it('前后紧邻字母或数字时不命中', () => {
    expect(matches('cn-id', `X${ID}`)).toEqual([]);
    expect(matches('cn-id', `${ID}9`)).toEqual([]);
  });
});

describe('cn-mobile 手机号码', () => {
  it('命中纯数字', () => {
    expect(matches('cn-mobile', '13812345678')).toEqual(['13812345678']);
  });

  it('命中连字符与空格分隔', () => {
    expect(matches('cn-mobile', '138-1234-5678')).toEqual(['138-1234-5678']);
    expect(matches('cn-mobile', '138 1234 5678')).toEqual(['138 1234 5678']);
  });

  it('命中带 +86 的写法', () => {
    expect(matches('cn-mobile', '+86 138 1234 5678')).toEqual(['+86 138 1234 5678']);
  });

  it('第二位不是 3–9 不命中', () => {
    expect(matches('cn-mobile', '12812345678')).toEqual([]);
  });

  it('位数不足或超出不命中', () => {
    expect(matches('cn-mobile', '1381234567')).toEqual([]);
    expect(matches('cn-mobile', '138123403078515')).toEqual([]);
  });
});

describe('cn-landline 固定电话', () => {
  it('命中 010 区号（3 位）', () => {
    expect(matches('cn-landline', '(010)88886666')).toEqual(['(010)88886666']);
    expect(matches('cn-landline', '010-88886666')).toEqual(['010-88886666']);
  });

  it('命中 02x 区号（3 位）', () => {
    expect(matches('cn-landline', '021-88886666')).toEqual(['021-88886666']);
  });

  it('命中 4 位区号与 7 位本地号', () => {
    expect(matches('cn-landline', '0571-88886666')).toEqual(['0571-88886666']);
    expect(matches('cn-landline', '0755-8888888')).toEqual(['0755-8888888']);
  });

  it('无分隔写法也能命中', () => {
    expect(matches('cn-landline', '057188886666')).toEqual(['057188886666']);
  });

  it('手机号不会被当成固定电话', () => {
    expect(matches('cn-landline', '13812345678')).toEqual([]);
  });

  it('没有区号的 8 位数字不命中', () => {
    expect(matches('cn-landline', '88886666')).toEqual([]);
  });
});

describe('cn-address 地址', () => {
  it('命中带省市区的完整地址', () => {
    expect(matches('cn-address', '北京市朝阳区建国路88号')).toEqual(['北京市朝阳区建国路88号']);
  });

  it('命中带楼栋单元房间号的地址', () => {
    expect(matches('cn-address', '杭州市西湖区文一西路969号3号楼2单元301室')).toEqual([
      '杭州市西湖区文一西路969号3号楼2单元301室',
    ]);
  });

  it('命中没写省市的短地址（区县 + 路 + 门牌）', () => {
    expect(matches('cn-address', '朝阳区建国路甲9号院3号楼2单元301室')).toEqual([
      '朝阳区建国路甲9号院3号楼2单元301室',
    ]);
  });

  it('命中以村名结尾的地址', () => {
    expect(matches('cn-address', '河北省保定市涞水县三坡镇苟各庄村')).toEqual([
      '河北省保定市涞水县三坡镇苟各庄村',
    ]);
  });

  it('只有省市、没有门牌不命中', () => {
    expect(matches('cn-address', '北京市')).toEqual([]);
    expect(matches('cn-address', '杭州市西湖区')).toEqual([]);
  });

  it('没有锚点的路名不命中', () => {
    expect(matches('cn-address', '建国路88号')).toEqual([]);
  });
});

describe('cn-company 单位名称', () => {
  it('命中有限公司与有限责任公司', () => {
    expect(matches('cn-company', '北京筑梦科技有限公司')).toEqual(['北京筑梦科技有限公司']);
    expect(matches('cn-company', '上海云图网络科技有限责任公司')).toEqual(['上海云图网络科技有限责任公司']);
  });

  it('命中分公司与事务所', () => {
    expect(matches('cn-company', '深圳前海数据服务有限公司北京分公司')).toEqual([
      '深圳前海数据服务有限公司北京分公司',
    ]);
    expect(matches('cn-company', '金诚会计师事务所')).toEqual(['金诚会计师事务所']);
  });

  it('「本公司」「贵公司」不算单位名', () => {
    expect(matches('cn-company', '本公司将于下月交付')).toEqual([]);
    expect(matches('cn-company', '贵公司地址')).toEqual([]);
  });
});

describe('cn-uscc 统一社会信用代码', () => {
  it('命中校验通过的 18 位代码', () => {
    expect(matches('cn-uscc', `统一社会信用代码：${USCC}`)).toEqual([USCC]);
    expect(matches('cn-uscc', USCC2)).toEqual([USCC2]);
  });

  it('校验位错误不命中', () => {
    expect(matches('cn-uscc', '91110108MA01ABCD2I')).toEqual([]);
  });

  it('含 I O S V Z 的串不命中', () => {
    expect(matches('cn-uscc', '91110108MA01ABCD2Z')).toEqual([]);
    expect(matches('cn-uscc', '91110108MAO1ABCD2H')).toEqual([]);
  });
});

describe('cn-bank-card 银行卡号', () => {
  it('命中银联 62 开头的卡号', () => {
    expect(matches('cn-bank-card', CARD16)).toEqual([CARD16]);
    expect(matches('cn-bank-card', '6222 0212 3456 7890 128')).toEqual(['6222 0212 3456 7890 128']);
  });

  it('Luhn 校验不过不命中', () => {
    expect(matches('cn-bank-card', `${CARD16.slice(0, -1)}5`)).toEqual([]);
  });

  it('非 62 开头的境外卡不归银行卡', () => {
    expect(matches('cn-bank-card', '4242424242424242')).toEqual([]);
  });
});

describe('cn-plate 车牌号', () => {
  it('命中普通车牌与新能源车牌', () => {
    expect(matches('cn-plate', '京A12345')).toEqual(['京A12345']);
    expect(matches('cn-plate', '粤B12345D')).toEqual(['粤B12345D']);
  });

  it('位数不足不命中', () => {
    expect(matches('cn-plate', '京A1234')).toEqual([]);
  });

  it('不含字母 I、O', () => {
    expect(matches('cn-plate', '京I12345')).toEqual([]);
  });
});

describe('cn-passport 护照号', () => {
  it('命中标签后的护照号', () => {
    expect(matches('cn-passport', '护照号：E12345678')).toEqual(['E12345678']);
    expect(matches('cn-passport', 'Passport No. G87654321')).toEqual(['G87654321']);
  });

  it('没有标签不命中', () => {
    expect(matches('cn-passport', '编号 E12345678')).toEqual([]);
  });
});

describe('email 邮箱', () => {
  it('命中带加号标签与子域名的地址', () => {
    expect(matches('email', 'a.b+c@example.com')).toEqual(['a.b+c@example.com']);
    expect(matches('email', 'zhang.wei@hospital.example.org')).toEqual(['zhang.wei@hospital.example.org']);
  });

  it('没有域名后缀不命中', () => {
    expect(matches('email', 'a@b')).toEqual([]);
  });
});

describe('zh-name 中文姓名', () => {
  it('命中称谓前的姓名', () => {
    expect(matches('zh-name', '王小明先生')).toEqual(['王小明']);
    expect(matches('zh-name', '李娜女士')).toEqual(['李娜']);
  });

  it('命中复姓姓名', () => {
    expect(matches('zh-name', '欧阳志远（')).toEqual(['欧阳志远']);
  });

  it('命中句子中间的姓名', () => {
    expect(matches('zh-name', '工程师程大伟表示')).toEqual(['程大伟']);
  });

  it('不把地名当人名', () => {
    expect(matches('zh-name', '吉林的张文远')).toEqual(['张文远']);
    expect(matches('zh-name', '公司位于海南')).toEqual([]);
  });

  it('不把常用词当人名', () => {
    expect(matches('zh-name', '我们的方法是通过程序处理')).toEqual([]);
    expect(matches('zh-name', '任何人不')).toEqual([]);
  });

  it('不把「姓 + 职务」当成完整姓名', () => {
    expect(matches('zh-name', '王经理')).toEqual([]);
    expect(matches('zh-name', '李主任')).toEqual([]);
  });
});

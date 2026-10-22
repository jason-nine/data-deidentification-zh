import { describe, it, expect } from 'vitest';
import { BUILTIN_PATTERNS } from '../../src/core/patterns';
import { detect } from '../../src/core/detector';

const NAME = BUILTIN_PATTERNS.filter((p) => p.id === 'zh-name');

/** 只跑姓名规则，便于精确定位误判。 */
function names(text: string): string[] {
  return detect(text, NAME).map((i) => i.original);
}

/** 用全部规则跑，检查真实使用场景下姓名类别的结果。 */
function nameItems(text: string): string[] {
  return detect(text, BUILTIN_PATTERNS)
    .filter((i) => i.category === '姓名')
    .map((i) => i.original);
}

describe('姓名规则：姓氏开头的常用词不得误判', () => {
  // 用户在真实物业维修函里遇到的误判，逐条固化
  const FALSE_POSITIVES = [
    '关于要求履行共用排水立管维修义务', // 关于、管维修
    '并出具维修方案及权属意见的函', // 权属意
    '本人系房屋所有权人', // 房屋、权人
    '共用排水立管部位存在渗漏', // 管道
    '接口周边形成水渍并沿下方蔓延', // 成水渍
    '本人未对该部位管道实施改造', // 施改造
    '依据《中华人民共和国民法典》的有关规定', // 依据、规定
    '经营性用房等专有部分享有所有权', // 房等专
    '乙方应在两小时内响应，并于八小时内提出处置方案', // 时内
    '乙方在履约期间完成的工作成果', // 成果
    '中国工商银行　账号 6222', // 商银行
    '双方应遵守下列条款', // 应遵守
    '顺颂商祺', // 商祺
    '本项目施工方案及进度安排', // 项目、施工
  ];

  for (const text of FALSE_POSITIVES) {
    it(`「${text}」不命中姓名`, () => {
      expect(names(text)).toEqual([]);
    });
  }

  it('单字不构成姓名', () => {
    expect(names('关')).toEqual([]);
    expect(names('管')).toEqual([]);
    expect(names('权')).toEqual([]);
  });
});

describe('姓名规则：真实姓名仍然命中', () => {
  it('标签与称谓前的姓名', () => {
    expect(names('联系人：李建华，电话')).toEqual(['李建华']);
    expect(names('业主：王秀兰')).toEqual(['王秀兰']);
    expect(names('王小明先生')).toEqual(['王小明']);
    expect(names('李娜女士')).toEqual(['李娜']);
  });

  it('后接单个虚词的三字名', () => {
    expect(names('社工陈大文于 2026 年 3 月访视')).toEqual(['陈大文']);
    expect(names('王小明来电')).toEqual(['王小明']);
  });

  it('后接谓语的三字名', () => {
    expect(names('工程师程大伟表示')).toEqual(['程大伟']);
    expect(names('王小明另提供紧急联系人')).toEqual(['王小明']);
  });

  it('复姓姓名', () => {
    expect(names('欧阳志远（手机')).toEqual(['欧阳志远']);
  });
});

describe('姓名规则：整段文书', () => {
  const DOC = `关于要求履行共用排水立管维修义务并出具维修方案及权属意见的函

本人系【 】小区【 】号楼【 】室房屋所有权人（以下称“本人”）。现就本人房屋卫生间排水管道渗漏及贵司维修养护义务履行事宜，依据《中华人民共和国民法典》的有关规定，函告如下。

（一）渗漏位置。本人楼【 】室房屋卫生间顶部吊顶内，坐便器出水弯管与公共排水立管部位存在渗漏。

（二）渗漏状态。现场可见该接口处持续滴水，接口周边形成水渍并沿下方金属构件大面积蔓延。

（三）本人房屋情况。本人房屋卫生间地面防水层完好，地面无积水现象；本人未对该部位管道实施改造。

（四）房屋使用年限。本房屋竣工验收备案至今已逾十五年，共用排水立管已进入自然老化与更新改造期。

请贵司于收到本函之日起十五日内，派员现场核查并出具书面维修方案。联系人：李建华，联系电话 138-1234-5678。

业主：王秀兰
2026年10月22日
`;

  it('只命中真实姓名，不命中任何常用词', () => {
    expect(names(DOC)).toEqual(['李建华', '王秀兰']);
  });

  it('与地址、电话等规则共存时结果一致', () => {
    expect(nameItems(DOC)).toEqual(['李建华', '王秀兰']);
  });
});

import { describe, it, expect } from 'vitest';
import { maskDisplay } from '../../src/core/mask';
import type { Category } from '../../src/core/types';

describe('maskDisplay', () => {
  describe('姓名', () => {
    it('只保留姓氏', () => {
      expect(maskDisplay('姓名', '王小明')).toBe('王OO');
      expect(maskDisplay('姓名', '李娜')).toBe('李O');
    });

    it('复姓整体保留', () => {
      expect(maskDisplay('姓名', '欧阳志远')).toBe('欧阳OO');
    });

    it('单字姓名全部隐藏', () => {
      expect(maskDisplay('姓名', '王')).toBe('OO');
    });
  });

  describe('身份证', () => {
    it('保留前 3 位与后 2 位', () => {
      expect(maskDisplay('身份证', '110101199003078515')).toBe('110*************15');
    });
  });

  describe('手机', () => {
    it('统一显示为 138****5678', () => {
      expect(maskDisplay('手机', '13812345678')).toBe('138****5678');
      expect(maskDisplay('手机', '138-1234-5678')).toBe('138****5678');
      expect(maskDisplay('手机', '+86 138 1234 5678')).toBe('138****5678');
    });
  });

  describe('固定电话', () => {
    it('保留区号与末 2 位', () => {
      expect(maskDisplay('固定电话', '01088886666')).toBe('0108-****-66');
      expect(maskDisplay('固定电话', '0571-88886666')).toBe('0571-****-66');
    });
  });

  describe('地址', () => {
    it('保留省市区前缀', () => {
      expect(maskDisplay('地址', '北京市朝阳区建国路88号')).toBe('北京市朝阳区***');
      expect(maskDisplay('地址', '浙江省杭州市西湖区文一西路969号')).toBe('浙江省杭州市西湖区***');
    });

    it('只有省市前缀时退回保留前 3 个字，且不等于原文', () => {
      expect(maskDisplay('地址', '北京市朝阳区')).toBe('北京市***');
      expect(maskDisplay('地址', '北京市朝阳区')).not.toBe('北京市朝阳区');
    });
  });

  describe('邮箱', () => {
    it('保留域名', () => {
      expect(maskDisplay('邮箱', 'xiaoming.wang@example.com')).toBe('xi***@example.com');
      expect(maskDisplay('邮箱', 'a@b.co')).toBe('a***@b.co');
    });
  });

  describe('单位名称', () => {
    it('保留前两字与组织形式', () => {
      expect(maskDisplay('单位名称', '北京筑梦科技有限公司')).toBe('北京**有限公司');
    });
  });

  describe('银行卡 / 车牌 / 统一社会信用代码', () => {
    it('银行卡只留后 4 位', () => {
      expect(maskDisplay('银行卡', '6222021234567894')).toBe('************7894');
    });

    it('车牌只留省份简称', () => {
      expect(maskDisplay('车牌', '京A12345')).toBe('京******');
    });

    it('统一社会信用代码保留前 2 后 1', () => {
      expect(maskDisplay('统一社会信用代码', '91110108MA01ABCD2H')).toBe('91***************H');
    });
  });

  describe('标识符', () => {
    it('保留前 3 个字符', () => {
      expect(maskDisplay('标识符', 'EMP-004521')).toBe('EMP*******');
    });

    it('过短的标识符全部隐藏', () => {
      expect(maskDisplay('标识符', 'AB')).toBe('**');
    });
  });

  describe('通用不变量（所有类别）', () => {
    const table: Array<{ category: Category; original: string }> = [
      { category: '姓名', original: '王小明' },
      { category: '身份证', original: '110101199003078515' },
      { category: '护照', original: 'E12345678' },
      { category: '手机', original: '138-1234-5678' },
      { category: '固定电话', original: '(010)88886666' },
      { category: '地址', original: '北京市朝阳区建国路88号' },
      { category: '邮箱', original: 'xiaoming.wang@example.com' },
      { category: '单位名称', original: '北京筑梦科技有限公司' },
      { category: '统一社会信用代码', original: '91110108MA01ABCD2H' },
      { category: '银行卡', original: '6222021234567894' },
      { category: '车牌', original: '京11010119905' },
      { category: '出生日期', original: '1990年3月14日' },
      { category: '标识符', original: 'EMP-004521' },
    ];

    it.each(table)('$category 的掩码不泄露原文且不为空', ({ category, original }) => {
      const masked = maskDisplay(category, original);
      expect(masked).not.toBe(original);
      expect(masked.length).toBeGreaterThan(0);
    });
  });
});

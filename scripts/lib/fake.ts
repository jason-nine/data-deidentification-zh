// Deterministic fake data for realistic example documents. All values are fictional.

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Fake {
  private r: () => number;
  constructor(seed = 20260902) {
    this.r = rng(seed);
  }
  /** Uniform [0, 1). */
  chance(): number {
    return this.r();
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.r() * (max - min + 1));
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.r() * list.length)];
  }
  digits(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += this.int(0, 9);
    return s;
  }

  name(): string {
    const compound = this.r() < 0.04;
    const surname = compound ? this.pick(COMPOUND) : this.pick(SURNAMES);
    const given = this.pick(GIVEN_1) + (this.r() < 0.9 ? this.pick(GIVEN_2) : '');
    return surname + given;
  }

  /** 18 位居民身份证号，地区码取自真实行政区划，校验位按 GB 11643 计算。 */
  cnId(): string {
    const region = this.pick(REGIONS)[3];
    const year = this.int(1955, 2003);
    const month = this.int(1, 12);
    const day = this.int(1, 28);
    const birth = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
    const seq = `${this.int(0, 9)}${this.int(0, 9)}${this.pick([1, 3, 5, 7, 9])}`;
    const body = `${region}${birth}${seq}`;
    return body + cnIdCheck(body);
  }

  /** 手机号，1[3-9] 开头 11 位，带三种常见分隔写法。 */
  mobile(): string {
    const d = `1${this.pick('3456789'.split(''))}${this.digits(9)}`;
    const style = this.r();
    if (style < 0.4) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (style < 0.7) return d;
    return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  }

  /** 固定电话：三位区号（010／02x）与四位区号（0xxx）都配 8 位本地号。 */
  landline(): string {
    const area = this.pick(['010', '010', '021', '022', '023', '025', '028', '0571', '0755', '020', '027', '029']);
    const local = this.digits(8);
    const style = this.r();
    if (style < 0.4) return `(${area})${local.slice(0, 4)}-${local.slice(4)}`;
    if (style < 0.8) return `${area}-${local.slice(0, 4)}-${local.slice(4)}`;
    return `${area}-${local}`;
  }

  /** 省＋市＋区＋路＋门牌，全部落在真实行政区划上。 */
  address(): string {
    const [province, city, district] = this.pick(REGIONS);
    const road = this.pick(ROADS) + this.pick(['路', '路', '街', '大道']);
    const no = `${this.int(1, 500)}号`;
    const building = this.r() < 0.35 ? `${this.int(1, 30)}号楼` : '';
    return `${province}${city === province ? '' : city}${district}${road}${no}${building}`;
  }

  email(name?: string): string {
    const user = name ? romanize(name, this) : this.pick(['service', 'sales', 'info', 'contact']);
    return `${user}${this.r() < 0.5 ? '' : this.int(1, 99)}@${this.pick(DOMAINS)}`;
  }

  company(): string {
    return `${this.pick(COMPANY_A)}${this.pick(COMPANY_B)}${this.pick(['股份有限公司', '有限公司', '有限公司'])}`;
  }

  /** 18 位统一社会信用代码，校验位按 GB 32100 计算。 */
  uscc(): string {
    const region = this.pick(REGIONS)[3];
    let org = '';
    for (let i = 0; i < 9; i++) org += this.pick(USCC_CHARS.split(''));
    const body = `91${region}${org}`;
    return body + usccCheck(body);
  }

  date(year = 2026): string {
    return `${year}-${String(this.int(1, 12)).padStart(2, '0')}-${String(this.int(1, 28)).padStart(2, '0')}`;
  }

  birthday(): string {
    return `${this.int(1955, 2002)}-${String(this.int(1, 12)).padStart(2, '0')}-${String(this.int(1, 28)).padStart(2, '0')}`;
  }

  /** 银联卡号，62 开头、Luhn 校验通过。 */
  bankAccount(): string {
    const body = `6222${this.digits(11)}`;
    return body + luhnCheck(body);
  }
}

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = '10X98765432';

/** 前 17 位的加权和模 11 决定校验位（GB 11643）。 */
function cnIdCheck(body17: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(body17[i]) * ID_WEIGHTS[i];
  return ID_CHECK[sum % 11];
}

const USCC_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const USCC_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

/** 前 17 位的加权和模 31 决定校验码（GB 32100）。 */
function usccCheck(body17: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += USCC_CHARS.indexOf(body17[i]) * USCC_WEIGHTS[i];
  const c = 31 - (sum % 31);
  return USCC_CHARS[c === 31 ? 0 : c];
}

/** Luhn 校验位。 */
function luhnCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

/** 姓名 → 邮箱本地部分：姓＋名首字，最长两段，短到扫描件也能认全。 */
function romanize(name: string, f: Fake): string {
  const parts: string[] = [];
  for (const ch of name.slice(0, 2)) parts.push(PINYIN[ch] ?? `x${f.int(1, 9)}`);
  return parts.join('.');
}

const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('');
const COMPOUND = ['欧阳', '司马', '上官', '诸葛'];
const GIVEN_1 = '伟芳娜敏静丽强磊军洋勇艳杰娟涛明超秀霞平刚桂英华建国文志海燕宇晨思嘉雨欣佳子雅梦'.split('');
const GIVEN_2 = '华玲豪婷安琪仪诚慧慈泽轩萱恩翔霖蓉庭如芸真彤瑜玮伦芷宁琳涛鹏辉磊鑫然轩菲涵'.split('');
const PINYIN: Record<string, string> = {
  王: 'wang', 李: 'li', 张: 'zhang', 刘: 'liu', 陈: 'chen', 杨: 'yang', 黄: 'huang', 赵: 'zhao', 吴: 'wu', 周: 'zhou',
  徐: 'xu', 孙: 'sun', 马: 'ma', 朱: 'zhu', 胡: 'hu', 郭: 'guo', 何: 'he', 高: 'gao', 林: 'lin', 罗: 'luo',
  郑: 'zheng', 梁: 'liang', 谢: 'xie', 宋: 'song', 唐: 'tang', 许: 'xu', 韩: 'han', 冯: 'feng', 邓: 'deng', 曹: 'cao',
  彭: 'peng', 曾: 'zeng', 肖: 'xiao', 田: 'tian', 董: 'dong', 袁: 'yuan', 潘: 'pan', 于: 'yu', 蒋: 'jiang', 蔡: 'cai',
  余: 'yu', 杜: 'du', 叶: 'ye', 程: 'cheng', 苏: 'su', 魏: 'wei', 吕: 'lv', 丁: 'ding', 任: 'ren', 沈: 'shen',
  姚: 'yao', 卢: 'lu', 姜: 'jiang', 崔: 'cui', 钟: 'zhong', 谭: 'tan', 陆: 'lu', 汪: 'wang', 范: 'fan', 金: 'jin',
  石: 'shi', 廖: 'liao', 贾: 'jia', 夏: 'xia', 韦: 'wei', 付: 'fu', 方: 'fang', 白: 'bai', 邹: 'zou', 孟: 'meng',
  熊: 'xiong', 秦: 'qin', 邱: 'qiu', 江: 'jiang', 尹: 'yin', 薛: 'xue', 闫: 'yan', 段: 'duan', 雷: 'lei', 侯: 'hou',
  龙: 'long', 史: 'shi', 陶: 'tao', 黎: 'li', 贺: 'he', 顾: 'gu', 毛: 'mao', 郝: 'hao', 龚: 'gong', 邵: 'shao',
  万: 'wan', 钱: 'qian', 严: 'yan', 覃: 'qin', 武: 'wu', 戴: 'dai', 莫: 'mo', 孔: 'kong', 向: 'xiang', 汤: 'tang',
  欧: 'ou', 阳: 'yang', 司: 'si', 上: 'shang', 官: 'guan', 诸: 'zhu', 葛: 'ge',
  伟: 'wei', 芳: 'fang', 娜: 'na', 敏: 'min', 静: 'jing', 丽: 'li', 强: 'qiang', 磊: 'lei', 军: 'jun', 洋: 'yang',
  勇: 'yong', 艳: 'yan', 杰: 'jie', 娟: 'juan', 涛: 'tao', 明: 'ming', 超: 'chao', 秀: 'xiu', 霞: 'xia', 平: 'ping',
  刚: 'gang', 桂: 'gui', 英: 'ying', 华: 'hua', 建: 'jian', 国: 'guo', 文: 'wen', 志: 'zhi', 海: 'hai', 燕: 'yan',
  宇: 'yu', 晨: 'chen', 思: 'si', 嘉: 'jia', 雨: 'yu', 欣: 'xin', 佳: 'jia', 子: 'zi', 雅: 'ya', 梦: 'meng',
  玲: 'ling', 豪: 'hao', 婷: 'ting', 安: 'an', 琪: 'qi', 仪: 'yi', 诚: 'cheng', 慧: 'hui', 慈: 'ci', 泽: 'ze',
  轩: 'xuan', 萱: 'xuan', 恩: 'en', 翔: 'xiang', 霖: 'lin', 蓉: 'rong', 庭: 'ting', 如: 'ru', 芸: 'yun', 真: 'zhen',
  彤: 'tong', 瑜: 'yu', 玮: 'wei', 伦: 'lun', 芷: 'zhi', 宁: 'ning', 琳: 'lin', 鹏: 'peng', 辉: 'hui', 鑫: 'xin',
  然: 'ran', 菲: 'fei', 涵: 'han',
};
const DOMAINS = ['example.com', 'example.com', 'example.net', 'corp-example.cn', 'example.cn'];
const COMPANY_A = ['宏达', '嘉宏', '联诚', '晶华', '永丰', '泰宇', '鼎新', '博盛', '瑞邦', '禾丰', '筑梦', '云创', '智联', '欣业', '瀚宇'];
const COMPANY_B = ['科技', '信息技术', '工程', '国际', '企业', '实业', '咨询', '数字', '网络', '生物'];
const ROADS = ['中山', '人民', '解放', '建设', '和平', '新华', '长江', '黄河', '文化', '科技', '创业', '金融', '花园', '学院', '望京', '复兴', '建国', '南京', '北京', '世纪', '天府', '西湖', '光谷', '星海'];
/** 省／市／区＋行政区划代码，用作身份证号、统一社会信用代码与地址的共同底料。 */
const REGIONS: [string, string, string, string][] = [
  ['北京市', '北京市', '朝阳区', '110105'],
  ['北京市', '北京市', '海淀区', '110108'],
  ['北京市', '北京市', '西城区', '110102'],
  ['上海市', '上海市', '浦东新区', '310115'],
  ['上海市', '上海市', '徐汇区', '310104'],
  ['广东省', '广州市', '天河区', '440106'],
  ['广东省', '深圳市', '南山区', '440305'],
  ['广东省', '深圳市', '福田区', '440304'],
  ['浙江省', '杭州市', '西湖区', '330106'],
  ['浙江省', '杭州市', '滨江区', '330108'],
  ['江苏省', '南京市', '鼓楼区', '320106'],
  ['江苏省', '苏州市', '工业园区', '320571'],
  ['四川省', '成都市', '武侯区', '510107'],
  ['湖北省', '武汉市', '洪山区', '420111'],
  ['陕西省', '西安市', '雁塔区', '610113'],
  ['山东省', '青岛市', '市南区', '370202'],
  ['福建省', '厦门市', '思明区', '350203'],
  ['天津市', '天津市', '南开区', '120104'],
  ['重庆市', '重庆市', '渝北区', '500112'],
  ['湖南省', '长沙市', '岳麓区', '430104'],
];

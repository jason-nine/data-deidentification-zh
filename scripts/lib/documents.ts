// Realistic example documents (all data fictional): a service contract (4 pages in Word,
// 3 in PDF), a 3-page quotation, a 60-row customer workbook, and a few text files.
// Content flows continuously — no forced page breaks — so pages are full like real documents.
import type { DocModel } from './docmodel.ts';
import { Fake } from './fake.ts';
import type { CellSpec, XlsxSpec } from '../../tests/helpers/xlsx-builder.ts';

export interface Party {
  company: string;
  uscc: string;
  address: string;
  rep: string;
  contact: string;
  phone: string;
  mobile: string;
  email: string;
}

function party(f: Fake): Party {
  const contact = f.name();
  return {
    company: f.company(),
    uscc: f.uscc(),
    address: f.address(),
    rep: f.name(),
    contact,
    phone: f.landline(),
    mobile: f.mobile(),
    email: f.email(contact),
  };
}

const money = (n: number) => `¥${n.toLocaleString('zh-CN')}`;

// ---------------------------------------------------------------------------------------
// 服务合同书（Word 4 页／PDF 3 页）
// ---------------------------------------------------------------------------------------
export function contract(seed = 101): DocModel {
  const f = new Fake(seed);
  const a = party(f);
  const bName = f.name();
  const b = { name: bName, id: f.cnId(), address: f.address(), mobile: f.mobile(), email: f.email(bName), bank: f.bankAccount() };
  const witness = f.name();
  const start = '2026-10-01';
  const end = '2027-09-30';
  const fee = 85000;
  const contactRows: string[][] = [
    ['甲方－项目联系人', a.contact, a.phone, a.mobile, a.email],
    ['甲方－财务联系人', f.name(), f.landline(), f.mobile(), f.email()],
    ['甲方－信息联系人', f.name(), f.landline(), f.mobile(), f.email()],
    ['乙方', b.name, '—', b.mobile, b.email],
    ['乙方－紧急联系人', f.name(), '—', f.mobile(), '—'],
  ];

  return {
    title: '外包服务合同书',
    header: `${a.company}　外包服务合同书　合同编号 SC-2026-0917`,
    footer: '机密文件　未经双方书面同意不得披露',
    blocks: [
      { type: 'title', text: '外包服务合同书' },
      { type: 'subtitle', text: '合同编号：SC-2026-0917　　签约日期：2026 年 9 月 17 日' },
      { type: 'heading', text: '合同双方' },
      {
        type: 'kv',
        rows: [
          ['甲方', `${a.company}（统一社会信用代码 ${a.uscc}）`],
          ['法定代表人', a.rep],
          ['地址', a.address],
          ['联系人', `${a.contact}　电话 ${a.phone}　手机 ${a.mobile}　邮箱 ${a.email}`],
          ['乙方', `${b.name}（身份证号 ${b.id}）`],
          ['户籍地址', b.address],
          ['联系方式', `手机 ${b.mobile}　邮箱 ${b.email}`],
        ],
      },
      { type: 'para', text: `甲乙双方同意就甲方委托乙方提供信息系统运维与顾问服务事宜，订立本合同，并同意遵守下列条款：`, indent: true },
      { type: 'heading', text: '第一条　服务内容' },
      { type: 'para', text: '乙方应依附件一「服务项目表」所列项目提供服务，包括但不限于系统监控、例行维护、事件处理、性能调优及相关技术咨询。服务范围的变更应由双方另行书面约定。', indent: true },
      { type: 'heading', text: '第二条　合同期间' },
      { type: 'para', text: `本合同有效期自 ${start} 起至 ${end} 止，共计十二个月。期满前六十日内，任何一方未书面提出终止的，本合同自动延展一年，以后亦同。`, indent: true },
      { type: 'heading', text: '第三条　服务报酬与付款方式' },
      { type: 'para', text: `甲方应按月向乙方支付服务报酬 ${money(fee)}（含税）。乙方应于每月五日前开具当月付款申请单送达甲方联系人 ${a.contact}（${a.email}），甲方于收到付款申请单后三十日内以转账方式支付至乙方指定账户：${f.pick(['中国工商银行', '中国建设银行', '招商银行', '中国银行'])}　账号 ${b.bank}　账户名称 ${b.name}。`, indent: true },
      { type: 'para', text: '转账手续费由甲方承担。乙方应依法开具发票。', indent: true },
      { type: 'heading', text: '第四条　服务水平' },
      { type: 'para', text: '乙方应在甲方报告重大事件后两小时内响应，并于八小时内提出处置方案；一般事件应在一个工作日内响应。乙方每月应向甲方信息联系人提交服务报告。', indent: true },
      { type: 'heading', text: '第五条　保密义务' },
      { type: 'para', text: `乙方因履行本合同而知悉或持有甲方的商业秘密、客户信息（含客户姓名、身份证号、联系电话、地址等个人信息）及其他机密信息，应承担保密义务，未经甲方书面同意不得披露、交付或使第三方知悉。本条义务在合同终止后五年内继续有效。`, indent: true },
      { type: 'heading', text: '第六条　个人信息保护' },
      { type: 'para', text: '乙方处理甲方提供之个人信息，应遵守《中华人民共和国个人信息保护法》及相关法律法规，仅在履行本合同所必需的范围内收集、处理和使用，并采取适当的安全保护措施。乙方应在合同终止时将所有个人信息交还甲方或按甲方指示销毁，并出具承诺书。', indent: true },
      { type: 'heading', text: '第七条　知识产权' },
      { type: 'para', text: '乙方在履约期间完成的工作成果（含文档、代码、设计图纸等），其著作权自完成时起归甲方所有。乙方保证工作成果不侵害第三方知识产权。', indent: true },
      { type: 'heading', text: '第八条　违约责任' },
      { type: 'para', text: `任何一方违反本合同约定，经另一方书面催告限期改正而逾期未改正的，另一方有权终止本合同并要求赔偿损失。乙方违反第五条或第六条者，应向甲方支付违约金 ${money(500000)}，甲方损失超过该金额的，可另行要求赔偿。`, indent: true },
      { type: 'heading', text: '第九条　合同终止' },
      { type: 'para', text: '任何一方可提前三十日书面通知另一方终止本合同。合同终止时，乙方应在七日内完成交接，甲方应就已提供的服务按比例支付报酬。', indent: true },
      { type: 'heading', text: '第十条　通知' },
      { type: 'para', text: `本合同的通知应以书面形式作出，送达地址以本合同首页所载为准；以电子邮件送达的，甲方送达 ${a.email}，乙方送达 ${b.email}。地址或邮箱变更时应立即通知另一方，否则按原地址送达视为已合法送达。`, indent: true },
      { type: 'heading', text: '第十一条　准据法与管辖' },
      { type: 'para', text: '本合同以中华人民共和国法律为准据法。因本合同产生的争议，双方同意以北京市朝阳区人民法院为第一审管辖法院。', indent: true },
      { type: 'heading', text: '第十二条　其他' },
      { type: 'para', text: '本合同未尽事宜，依照相关法律法规及诚实信用原则处理。本合同一式两份，甲乙双方各执一份。附件为本合同的组成部分，与本合同具有同等效力。', indent: true },
      { type: 'heading', text: '附件一　服务项目表' },
      {
        type: 'table',
        columns: [{ header: '序号', width: 1 }, { header: '服务项目', width: 3 }, { header: '内容说明', width: 6 }, { header: '频率', width: 2 }],
        rows: [
          ['1', '系统监控', '主机、数据库与应用服务的可用性及性能监控，异常即时报告甲方信息联系人', '每日'],
          ['2', '例行维护', '安全性更新、备份校验、日志清理与容量检查', '每周'],
          ['3', '事件处理', '故障排除、根因分析与事件报告', '依需求'],
          ['4', '性能调优', '数据库索引、查询与缓存策略调整', '每季'],
          ['5', '技术咨询', '架构、信息安全与新技术引入的咨询', '每月 8 小时'],
          ['6', '服务报告', '月报含事件统计、SLA 达成率与改善建议', '每月'],
        ],
      },
      { type: 'heading', text: '附件二　联系人名单' },
      {
        type: 'table',
        columns: [{ header: '角色', width: 3 }, { header: '姓名', width: 2 }, { header: '电话', width: 3 }, { header: '手机', width: 3 }, { header: '邮箱', width: 4 }],
        rows: contactRows,
      },
      { type: 'para', text: '联系人变更时，应在三个工作日内以邮件通知另一方。' },
      { type: 'heading', text: '签署' },
      { type: 'para', text: '双方确认已充分阅读并理解本合同全部条款，同意签署如下：' },
      { type: 'spacer' },
      { type: 'kv', rows: [['甲方', a.company], ['统一社会信用代码', a.uscc], ['法定代表人', `${a.rep}　　　　　　　　　　（签章）`], ['地址', a.address], ['电话', a.phone]] },
      { type: 'spacer' },
      { type: 'kv', rows: [['乙方', `${b.name}　　　　　　　　　　（签章）`], ['身份证号', b.id], ['地址', b.address], ['手机', b.mobile]] },
      { type: 'spacer' },
      { type: 'kv', rows: [['见证人', `${witness}　　　　　　　　　　（签章）`], ['身份证号', f.cnId()], ['联系电话', f.mobile()]] },
      { type: 'spacer' },
      { type: 'para', text: '二〇二六年九月十七日', align: 'center' },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// 报价单（3 页）
// ---------------------------------------------------------------------------------------
export function quotation(seed = 202): DocModel {
  const f = new Fake(seed);
  const vendor = party(f);
  const client = party(f);
  const items: [string, string, number, number][] = [
    ['应用服务器', 'Dell PowerEdge R760，2×Xeon Gold 6430，256GB RAM', 2, 486000],
    ['存储阵列', 'NetApp AFF A250，24×3.84TB NVMe', 1, 1980000],
    ['核心交换机', 'Cisco Catalyst 9300 48P，含 10G 上联模块', 2, 268000],
    ['防火墙', 'FortiGate 200F，含 3 年 UTP 授权', 1, 412000],
    ['UPS 不间断电源', 'APC Smart-UPS SRT 10kVA', 1, 218000],
    ['机柜', '42U 标准机柜含 PDU', 2, 36000],
    ['虚拟化平台授权', 'VMware vSphere Standard，8 CPU', 1, 356000],
    ['备份软件', 'Veeam Backup & Replication Enterprise，10 instance', 1, 186000],
    ['操作系统授权', 'Windows Server 2022 Datacenter，16 core', 2, 198000],
    ['数据库授权', 'Microsoft SQL Server 2022 Standard，2 core pack', 4, 128000],
    ['监控系统', 'Zabbix 部署与定制仪表板', 1, 96000],
    ['实施服务', '硬件上架、布线、虚拟化平台部署与迁移', 1, 320000],
    ['信息安全检测', '漏洞扫描与渗透测试（一次）', 1, 150000],
    ['培训', '运维人员培训 2 天（每场至多 12 人）', 2, 45000],
    ['维保服务', '硬件 3 年次日到场、软件 1 年更新', 1, 468000],
    ['备份线路', 'MPLS VPN 100M，年费', 1, 240000],
    ['机房环境监控', '温湿度与漏水传感器含告警', 1, 58000],
    ['线材与耗材', 'Cat6A 跳线、光纤跳线与标签', 1, 22000],
    ['项目管理', '项目经理驻场 3 个月', 1, 270000],
    ['文档与移交', '架构文档、SOP 与验收报告', 1, 40000],
  ];
  const rows = items.map(([name, spec, qty, price], i) => [String(i + 1), name, spec, String(qty), money(price), money(qty * price)]);
  const subtotal = items.reduce((s, [, , q, p]) => s + q * p, 0);
  const tax = Math.round(subtotal * 0.13);
  const sales = { name: vendor.contact, mobile: vendor.mobile, email: vendor.email };
  const support = { name: f.name(), phone: f.landline(), mobile: f.mobile() };
  const supportEmail = f.email(support.name);

  return {
    title: '报价单',
    header: `${vendor.company}　报价单 Q-2026-0912`,
    footer: `${vendor.company}　${vendor.phone}`,
    blocks: [
      { type: 'title', text: '报　价　单' },
      { type: 'subtitle', text: '报价单号：Q-2026-0912　　报价日期：2026-09-12　　有效期限：2026-10-12' },
      { type: 'heading', text: '客户信息' },
      {
        type: 'kv',
        rows: [
          ['客户名称', `${client.company}（统一社会信用代码 ${client.uscc}）`],
          ['联系人', `${client.contact}　${f.pick(['信息部经理', '采购主管', '行政主管', '运营总监'])}`],
          ['电话', `${client.phone}　　手机 ${client.mobile}`],
          ['邮箱', client.email],
          ['收货地址', client.address],
          ['发票地址', f.address()],
        ],
      },
      { type: 'heading', text: '报价明细' },
      {
        type: 'table',
        columns: [{ header: '序号', width: 1 }, { header: '品名', width: 3 }, { header: '规格', width: 6 }, { header: '数量', width: 1.2 }, { header: '单价', width: 2.4 }, { header: '小计', width: 2.6 }],
        rows,
      },
      { type: 'kv', rows: [['不含税合计', money(subtotal)], ['增值税 13%', money(tax)], ['含税总计', money(subtotal + tax)]] },
      { type: 'para', text: '以上金额以人民币计价。本报价含运送至收货地址之运费，不含进口关税及其他规费。', indent: true },
      { type: 'heading', text: '交货与验收' },
      { type: 'para', text: `硬件设备于收到订单后 45 个日历天内交付至 ${client.address}；软件授权于收到订单后 7 个工作日内以电子方式交付。到货后由客户联系人 ${client.contact} 会同本公司人员进行验收，验收期为 10 个工作日。`, indent: true },
      { type: 'heading', text: '付款条件' },
      { type: 'para', text: `订单签回时支付 30% 定金，设备到货验收合格后支付 60%，质保期满 30 日内支付尾款 10%。请转账至：${f.pick(['中国工商银行', '中国建设银行', '招商银行'])}　账号 ${f.bankAccount()}　账户名称 ${vendor.company}。`, indent: true },
      { type: 'heading', text: '质保与维护' },
      { type: 'para', text: '硬件设备提供 3 年原厂质保及次日到场服务；软件提供 1 年版本更新与技术支持。质保期内非人为因素导致的故障由本公司负责维修或更换。', indent: true },
      { type: 'heading', text: '联系人' },
      {
        type: 'table',
        columns: [{ header: '角色', width: 2 }, { header: '姓名', width: 2 }, { header: '电话', width: 3 }, { header: '手机', width: 3 }, { header: '邮箱', width: 4 }],
        rows: [
          ['业务代表', sales.name, vendor.phone, sales.mobile, sales.email],
          ['技术支持', support.name, support.phone, support.mobile, supportEmail],
          ['客服中心', '—', '400-800-1234', '—', 'service@example.com.cn'],
        ],
      },
      { type: 'para', text: `本报价单有任何疑问，请洽业务代表 ${sales.name}（${sales.mobile}）。` },
      { type: 'heading', text: '客户确认签回' },
      { type: 'para', text: '本公司同意依上述报价内容与条件采购，请于签章后回传。' },
      { type: 'spacer' },
      { type: 'kv', rows: [['公司名称', client.company], ['统一社会信用代码', client.uscc], ['法定代表人', `${client.rep}　　　　　　　　　　（签章）`], ['采购联系人', `${client.contact}　${client.mobile}`], ['地址', client.address]] },
      { type: 'spacer' },
      { type: 'kv', rows: [['报价单位', vendor.company], ['统一社会信用代码', vendor.uscc], ['法定代表人', `${vendor.rep}　　　　　　　　　　（签章）`], ['地址', vendor.address], ['电话', vendor.phone]] },
      { type: 'spacer' },
      { type: 'para', text: '签回日期：　　　年　　　月　　　日', align: 'center' },
      { type: 'para', text: `本文件含个人信息，仅供交易双方使用；如需电子版请联系 ${sales.email}。`, align: 'center' },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// 客户信息（Excel：60 位客户 + 联系记录 + 业务联系人）
// ---------------------------------------------------------------------------------------
export function customers(seed = 303): XlsxSpec {
  const f = new Fake(seed);
  const reps = Array.from({ length: 6 }, () => ({ name: f.name(), mobile: f.mobile(), ext: `${f.int(100, 899)}`, email: '' }));
  reps.forEach((r) => (r.email = f.email(r.name)));

  const customerRows: CellSpec[][] = [
    ['客户编号', '姓名', '性别', '身份证号', '生日', '手机', '固定电话', '邮箱', '通信地址', '公司', '统一社会信用代码', '职称', '负责业务', '累计消费(元)', '备注'],
  ];
  const names: string[] = [];
  for (let i = 0; i < 60; i++) {
    const gender = f.int(1, 2) as 1 | 2;
    const name = f.name();
    names.push(name);
    const rep = f.pick(reps);
    const noteKind = f.chance();
    const note: CellSpec =
      noteKind < 0.25
        ? `${f.date()} 由 ${rep.name} 电话回访，改用手机 ${f.mobile()} 联系`
        : noteKind < 0.4
          ? { rich: ['紧急联系人：', `${f.name()} ${f.mobile()}`] }
          : noteKind < 0.5
            ? `发票寄送地址：${f.address()}`
            : '';
    customerRows.push([
      `CUST-${String(10001 + i * 7)}`,
      name,
      gender === 1 ? '男' : '女',
      f.cnId(),
      f.birthday(),
      f.mobile(),
      f.chance() < 0.7 ? f.landline() : '',
      f.email(name),
      f.address(),
      f.chance() < 0.8 ? f.company() : '',
      f.chance() < 0.8 ? f.uscc() : '',
      f.pick(['采购专员', '信息经理', '行政专员', '法定代表人', '会计', '销售主管', '行政助理']),
      rep.name,
      f.int(12, 980) * 1000,
      note,
    ]);
  }

  const logRows: CellSpec[][] = [['日期', '客户姓名', '客户编号', '承办业务', '联系方式', '摘要']];
  for (let i = 0; i < 30; i++) {
    const idx = f.int(0, 59);
    const rep = f.pick(reps);
    logRows.push([
      f.date(),
      names[idx],
      `CUST-${String(10001 + idx * 7)}`,
      rep.name,
      f.pick(['电话', '上门拜访', 'Email', '视频会议']),
      f.pick([
        `客户 ${names[idx]} 来电询问报价，回拨 ${f.mobile()} 确认需求`,
        `寄送样品至 ${f.address()}，签收人 ${f.name()}`,
        `客户更新联系邮箱为 ${f.email(names[idx])}`,
        `拜访客户公司，与 ${f.name()}（${f.landline()}）洽谈年度合同`,
        `客户反映账单地址有误，更正为 ${f.address()}`,
        `视频会议，客户方出席 ${f.name()}、${f.name()}`,
      ]),
    ]);
  }

  const repRows: CellSpec[][] = [['业务员', '分机', '手机', '邮箱', '负责区域']];
  for (const r of reps) repRows.push([r.name, r.ext, r.mobile, r.email, f.pick(['华北', '华东', '华南', '西南'])]);

  return {
    sheets: [
      { name: '客户信息', rows: customerRows },
      { name: '联系记录', rows: logRows },
      { name: '业务联系人', rows: repRows },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// 文字类：客服邮件（txt）与会议记录（md）
// ---------------------------------------------------------------------------------------
export function supportEmail(seed = 404): string {
  const f = new Fake(seed);
  const c = f.name();
  const agent = f.name();
  const id = f.cnId();
  return `主旨：Re: [客服单 #CS-2026-04471] 订单 ORD-88213 收货地址变更申请

${c} 您好：

感谢您的来信。已按您 ${f.date()} 来电（${f.mobile()}）的指示，将订单 ORD-88213 的出货地址由
「${f.address()}」
变更为
「${f.address()}」，
收件人维持 ${c}，联系电话 ${f.mobile()}。

为完成身份验证，我们已核对您留存的身份证号 ${id} 末四码与邮箱 ${f.email(c)}。若上述信息有误，请在三日内回复本邮件或拨打客服热线 ${f.landline()}（分机 ${f.int(100, 999)}）。

另提醒您，本次订单的发票将寄至 ${f.address()}，统一社会信用代码 ${f.uscc()}。

祝　商祺

${agent}
客户服务部
${f.company()}
电话 ${f.landline()}　手机 ${f.mobile()}
${f.email(agent)}

-----Original Message-----
From: ${c} <${f.email(c)}>
Sent: ${f.date()} 14:22
To: service@example.com.cn
Subject: [客服单 #CS-2026-04471] 订单 ORD-88213 收货地址变更申请

您好，我是 ${c}，想将订单 ORD-88213 的收货地址改到公司：${f.address()}，收件人 ${f.name()}，电话 ${f.mobile()}。
我的会员手机是 ${f.mobile()}，身份证末四码 ${id.slice(-4)}。麻烦协助，谢谢。
`;
}

export function meetingNotes(seed = 505): string {
  const f = new Fake(seed);
  const people = Array.from({ length: 5 }, () => f.name());
  return `# 项目启动会会议纪要

- **日期**：${f.date()} 14:00–15:30
- **地点**：${f.address()} 3 楼会议室
- **主席**：${people[0]}
- **出席**：${people.slice(1).join('、')}
- **记录人**：${people[4]}

## 讨论事项

1. 客户方联系人确认为 ${people[1]}（${f.mobile()}、${f.email(people[1])}），备份联系人 ${people[2]}（分机 ${f.int(100, 999)}）。
2. 测试环境账号由 ${people[3]} 于本周五前建立，通知信寄至 ${f.email(people[3])}。
3. 设备收货地址：${f.address()}，收件人 ${people[2]}，电话 ${f.landline()}。
4. 保密协议签署：乙方 ${people[4]}（身份证号 ${f.cnId()}）已在会前签署完毕。

## 决议

| 项目 | 法定代表人 | 期限 |
| --- | --- | --- |
| 需求规格书 v1.0 | ${people[1]} | ${f.date()} |
| 测试环境搭建 | ${people[3]} | ${f.date()} |
| 合同盖章 | ${people[0]}（${f.mobile()}） | ${f.date()} |

## 待办

- [ ] ${people[2]} 提供开票信息（统一社会信用代码 ${f.uscc()}、地址 ${f.address()}）
- [ ] ${people[4]} 更新联系人清单并寄给全体与会者
`;
}

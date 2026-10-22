// The 5-page scanned sample (all data fictional): HTML layouts that render-scan.ts turns into page
// images. Covers Chinese, English, tables, numbers, handwriting and text-free pictures: a Chinese
// letter with a pen note and a photo, a hand-filled form, a landscape roster table, an English
// invoice with a product photo and a sheet of bilingual business cards.
import { readFileSync } from 'node:fs';
import { Fake } from './fake.ts';
import type { Category } from '../../src/core/types.ts';

export interface ScanPage {
  title: string;
  /** Body markup; laid out on a 794×1123 (portrait) or 1123×794 (landscape) CSS px sheet. */
  html: string;
  landscape?: boolean;
  /** Colour scan; otherwise greyscale. */
  color?: boolean;
  /** Sheet rotation in degrees, as a scanner feeds paper slightly askew. */
  tilt: number;
  /** The whole scan turned by a quarter turn or more (paper fed sideways or upside down). */
  rotate?: 0 | 90 | 180 | 270;
  /** Printed values on the page that the built-in rules should detect. */
  planted: [Category, string][];
  /** Handwritten values: recognition is best effort, so they are counted apart from `planted`. */
  handwritten: [Category, string][];
  /** Text-free pictures on the page (photos, emblems) that the output should keep. */
  images: number;
  /** Sensitive values outside the built-in rules (e.g. romanised names), left for manual adding. */
  manual: string[];
}

interface Person {
  name: string;
  id: string;
  birthday: string;
  mobile: string;
  email: string;
  address: string;
}

// Single quotes inside: these go into style="…" attributes.
const SONG = "'Songti SC', 'Noto Serif SC', serif";
const SANS = "'PingFang SC', 'Noto Sans SC', sans-serif";
const HAND = "'Kaiti SC', 'Songti SC', serif";
const SERIF_EN = "'Times New Roman', Times, serif";
const SANS_EN = "Helvetica, Arial, sans-serif";
const SCRIPT = "Caveat, 'Snell Roundhand', cursive";

/**
 * Pictures generated with Codex for the sample (no text, no people); the originals live in
 * scripts/assets/scan/ so the sample can be rebuilt.
 */
const picture = (file: string, style: string) => {
  const data = readFileSync(new URL(`../assets/scan/${file}`, import.meta.url)).toString('base64');
  return `<img src="data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${data}" alt="" style="display:block;object-fit:cover;${style}">`;
};

/** Keeps a value on one printed line so recognition sees it whole. */
const nw = (s: string) => `<span style="white-space:nowrap">${s}</span>`;

function person(f: Fake): Person {
  const name = f.name();
  return { name, id: f.cnId(), birthday: f.birthday(), mobile: f.mobile().replace(/ /g, '-'), email: f.email(name), address: f.address() };
}

/** Romanised name in mainland pinyin style, e.g. 林美玲 → Lin Mei-Ling. */
function romanName(email: string): string {
  const parts = email.split('@')[0].replace(/\d+$/, '').split('.');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(parts[0])} ${parts.slice(1).map(cap).join('-')}`;
}

// ---------------------------------------------------------------------------------------
// 1. 中文信函
// ---------------------------------------------------------------------------------------
function letter(f: Fake): ScanPage {
  const company = f.company();
  const taxId = f.uscc();
  const address = f.address();
  const phone = f.landline();
  const rep = f.name();
  const r = person(f);
  const s = person(f);
  const bank = f.bankAccount();
  const aide = person(f);
  const p = (t: string) => `<p style="margin:0 0 9px;text-indent:-2em;padding-left:2em">${t}</p>`;
  return {
    title: '服务费用调整通知函',
    tilt: 0.35,
    handwritten: [['姓名', aide.name], ['手机', aide.mobile]],
    images: 2,
    planted: [
      ['单位名称', company], ['统一社会信用代码', taxId], ['地址', address], ['固定电话', phone], ['姓名', rep],
      ['姓名', r.name], ['身份证', r.id], ['地址', r.address], ['手机', r.mobile],
      ['姓名', s.name], ['手机', s.mobile], ['邮箱', s.email],
    ],
    manual: [],
    html: `
<div style="padding:62px 70px 50px;font-family:${SONG};color:#1b1b1b;font-size:15px;line-height:1.75">
  <div style="display:flex;align-items:center;gap:14px;border-bottom:2.5px double #333;padding-bottom:10px">
    ${picture('logo-mark.png', 'width:58px;height:58px;object-fit:contain;mix-blend-mode:multiply')}
    <div>
      <div style="font-size:24px;font-weight:700;letter-spacing:.12em">${company}</div>
      <div style="font-size:12.5px;color:#444">${nw(address)}　电话 ${nw(phone)}　统一社会信用代码 ${taxId}</div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin:14px 0 4px;font-size:14px">
    <div>${r.name} 先生／女士</div>
    <div style="text-align:right">发文日期：2026 年 10 月 6 日<br>发文字号：京信服〔2026〕21 号</div>
  </div>
  <h1 style="font-size:23px;text-align:center;letter-spacing:.3em;margin:18px 0 16px">通　知　函</h1>
  ${p(`主旨：关于贵我双方《信息系统运维服务合同》（合同编号 SC-2026-0917）服务费用调整及收款账户变更事宜，详见说明，请查照。`)}
  <p style="margin:0 0 6px">说明：</p>
  ${p(`一、根据双方于 2025 年 10 月 1 日签订的服务合同第三条约定，本公司可在每年度届满前 30 日通知调整服务费用。`)}
  ${p(`二、自 2026 年 11 月 1 日起，每月服务费用由人民币 85,000 元调整为人民币 92,500 元（含税），调幅 8.8%；年度总额为人民币 1,110,000 元。`)}
  ${p(`三、合同当事人信息：${r.name}，身份证号 ${r.id}，通信地址 ${nw(r.address)}，联系手机 ${nw(r.mobile)}。如有变更，请于 2026 年 10 月 31 日前书面通知本公司。`)}
  ${p(`四、自即日起本公司收款账户变更为：中国工商银行北京朝阳支行，账号 ${nw(bank)}，账户名称 ${company}；原账户将于 2026 年 12 月 31 日停止使用。`)}
  ${p(`五、本案承办人：业务部 ${s.name} 经理，电话 ${nw(phone)} 分机 215，手机 ${nw(s.mobile)}，邮箱 ${s.email}。`)}
  ${p(`六、附件：机房现场照片一张（2026 年 10 月 3 日拍摄）。`)}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:14px">
    <div style="font-size:14px">主送：${r.name} 先生／女士<br>抄送：本公司财务部、法务部</div>
    <div style="margin-right:20px;transform:rotate(-3deg);font:21px/1.4 ${HAND};color:#1d3f9a">10/8 已致电，改寄助理 ${aide.name}<br>手机 ${aide.mobile}</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:26px;margin-top:18px">
    ${picture('server-room.jpg', 'width:270px;height:190px;border:1px solid #777')}
    <div style="font-size:19px;letter-spacing:.2em;margin-left:auto;align-self:center">法定代表人　${rep}</div>
    <div style="width:84px;height:84px;border:4px solid #555;display:grid;grid-template-columns:1fr 1fr;align-items:center;justify-items:center;font:700 20px ${SONG};color:#555;transform:rotate(-4deg)">
      ${[2, 0, 3, 1].map((k) => `<span>${company[k]}</span>`).join('')}
    </div>
  </div>
  <div style="position:absolute;bottom:40px;left:0;right:0;text-align:center;font-size:11px;color:#666">第 1 页，共 1 页</div>
</div>`,
  };
}

// ---------------------------------------------------------------------------------------
// 2. 手写申请表单
// ---------------------------------------------------------------------------------------
function form(f: Fake): ScanPage {
  const a = person(f);
  const phone = f.landline();
  const ec = person(f);
  const employer = f.company();
  const employerTax = f.uscc();
  const jitter = [-1.2, 0.8, -0.5, 1.1, -0.9, 0.6, -1.4, 0.4, 1.3, -0.7, 0.9, -1.1];
  let j = 0;
  /** A hand-filled value in blue ballpoint, each slightly askew. */
  const hand = (v: string, size = 22) =>
    `<span style="font-family:${HAND};font-size:${size}px;color:#1d3f9a;display:inline-block;transform:rotate(${jitter[j++ % jitter.length]}deg) translateY(1px)">${v}</span>`;
  const box = (checked: boolean, label: string) =>
    `<span style="white-space:nowrap;margin-right:14px"><span data-checkbox="${checked ? 1 : 0}" style="display:inline-block;width:13px;height:13px;border:1.4px solid #222;vertical-align:-1px;position:relative">${
      checked ? `<span style="position:absolute;left:-1px;top:-9px;font:700 19px ${HAND};color:#1d3f9a">✓</span>` : ''
    }</span> ${label}</span>`;
  const th = 'style="background:#ececec;border:1.3px solid #222;padding:7px 8px;font-weight:600;white-space:nowrap;width:94px"';
  const td = 'style="border:1.3px solid #222;padding:5px 16px;height:34px"';
  return {
    title: '会员入会申请表',
    color: true,
    tilt: -0.3,
    planted: [],
    handwritten: [
      ['姓名', a.name], ['身份证', a.id], ['固定电话', phone], ['手机', a.mobile], ['邮箱', a.email], ['地址', a.address],
      ['姓名', ec.name], ['手机', ec.mobile], ['单位名称', employer], ['统一社会信用代码', employerTax], ['出生日期', a.birthday],
    ],
    images: 0,
    manual: [],
    html: `
<div style="padding:54px 58px;font-family:${SANS};color:#111;font-size:14px">
  <div style="display:flex;justify-content:space-between;align-items:flex-end">
    <div style="font-size:12px;color:#333">表单编号：MBR-F01（2026.07 版）</div>
    <div style="font-size:12px;color:#333">受理编号：${hand('M2026-00872', 16)}</div>
  </div>
  <h1 style="text-align:center;font-size:26px;letter-spacing:.25em;margin:10px 0 4px">会员入会申请表</h1>
  <div style="text-align:center;font-size:12.5px;color:#333;margin-bottom:12px">（请以正楷填写，并在 □ 内打勾）</div>
  <div style="margin-bottom:8px">申请项目：${box(true, '新申请')}${box(false, '信息变更')}${box(false, '终止会籍')}</div>
  <table style="border-collapse:collapse;width:100%">
    <tr><th ${th}>姓　　名</th><td ${td}>${hand(a.name, 21)}</td><th ${th}>性　　别</th><td ${td}>${box(true, '男')}${box(false, '女')}</td></tr>
    <tr><th ${th}>身份证号</th><td ${td}>${hand(a.id)}</td><th ${th}>出生日期</th><td ${td}>${hand(a.birthday, 17)}</td></tr>
    <tr><th ${th}>固定电话</th><td ${td}>${hand(phone)}</td><th ${th}>手机</th><td ${td}>${hand(a.mobile)}</td></tr>
    <tr><th ${th}>邮箱</th><td ${td} colspan="3">${hand(a.email)}</td></tr>
    <tr><th ${th}>户籍地址</th><td ${td} colspan="3">${hand(a.address)}</td></tr>
    <tr><th ${th}>通信地址</th><td ${td} colspan="3">${box(true, '同户籍地址')}${box(false, '其他：')}</td></tr>
    <tr><th ${th}>工作单位</th><td ${td}>${hand(employer, 17)}</td><th ${th}>统一社会信用代码</th><td ${td}>${hand(employerTax)}</td></tr>
    <tr><th ${th}>紧急联系人</th><td ${td}>${hand(ec.name)}　关系：${hand('配偶', 17)}</td><th ${th}>联系电话</th><td ${td}>${hand(ec.mobile)}</td></tr>
  </table>
  <div style="margin:12px 0 6px">通知方式：${box(true, '电子邮件')}${box(false, '手机短信')}${box(false, '邮寄')}</div>
  <div style="font-size:12px;line-height:1.7;color:#222;border:1px dashed #555;padding:8px 10px;margin-top:8px">
    个人信息收集告知：本会依照《中华人民共和国个人信息保护法》的相关规定，在会员服务、活动通知及统计分析的目的范围内，收集、处理和使用您所提供的个人信息，
    保存期限至会籍终止后 5 年。您可随时向本会请求查阅、复制、补充、更正或删除。
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px">
    <div>申请人签章：${hand(a.name, 30)}</div>
    <div>填表日期：${hand('2026 / 10 / 06')}</div>
  </div>
  <div style="margin-top:28px;border-top:1.5px dashed #444;padding-top:8px;font-size:12px;color:#333">以下由本会填写</div>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:6px">
    <tr><th ${th}>受理日期</th><td ${td}>${hand('2026-10-07', 16)}</td><th ${th}>会员编号</th><td ${td}>${hand('A-2026-0457', 16)}</td><th ${th}>审核</th><td ${td}></td></tr>
  </table>
</div>`,
  };
}

// ---------------------------------------------------------------------------------------
// 3. 名册表格（横式）
// ---------------------------------------------------------------------------------------
function roster(f: Fake): ScanPage {
  const org = f.company();
  const owner = f.name();
  const phone = f.landline();
  const rows = Array.from({ length: 16 }, () => person(f));
  // Horizontal rules only, like most printed lists; vertical cell borders get read as「|」.
  const cell = 'border-bottom:1px solid #9a9a9a;padding:4px 6px;white-space:nowrap';
  return {
    title: '志愿者服务名册',
    landscape: true,
    tilt: 0.25,
    handwritten: [],
    images: 0,
    planted: [
      ['单位名称', org], ['姓名', owner], ['固定电话', phone],
      ...rows.flatMap((r): [Category, string][] => [['姓名', r.name], ['身份证', r.id], ['手机', r.mobile], ['邮箱', r.email], ['地址', r.address]]),
    ],
    manual: [],
    html: `
<div style="padding:34px 36px;font-family:${SANS};color:#111;font-size:15px">
  <h1 style="text-align:center;font-size:21px;margin:0 0 6px;letter-spacing:.08em">2026 年度第二季度 志愿者服务名册</h1>
  <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:8px">
    <span>填表单位：${org}</span><span>承办人：${owner}　联系电话：${phone}</span><span>制表日期：2026-10-06</span>
  </div>
  <table style="border-collapse:collapse;width:100%">
    <tr style="background:#e4e4e4;border-top:2px solid #444">${['编号', '姓名', '身份证号', '手机', '邮箱', '通信地址'].map((h) => `<th style="${cell};font-weight:700">${h}</th>`).join('')}</tr>
    ${rows
      .map(
        (r, i) =>
          `<tr><td style="${cell};text-align:center">${String(i + 1).padStart(3, '0')}</td><td style="${cell}">${r.name}</td><td style="${cell}">${r.id}</td><td style="${cell}">${r.mobile}</td><td style="${cell}">${r.email}</td><td style="${cell}">${r.address}</td></tr>`,
      )
      .join('')}
  </table>
  <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:12px">
    <span>合计 ${rows.length} 人。</span><span>第 3 页</span>
  </div>
</div>`,
  };
}

// ---------------------------------------------------------------------------------------
// 4. 英文商业发票
// ---------------------------------------------------------------------------------------
function invoice(f: Fake): ScanPage {
  const seller = '嘉宏信息股份有限公司';
  const sellerTax = f.uscc();
  const buyer = f.company();
  const buyerTax = f.uscc();
  const buyerAddress = f.address();
  const b = person(f);
  const s = person(f);
  const phone = f.landline();
  const items: [string, number, number][] = [
    ['Cloud server maintenance (Oct. 2026)', 1, 2850],
    ['Security audit & penetration test', 1, 4200],
    ['SSD storage expansion, 2 TB', 4, 186.5],
    ['On-site support (hours)', 12, 85],
    ['SSL certificate, wildcard, 1 year', 1, 129.99],
  ];
  const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const subtotal = items.reduce((t, [, q, p]) => t + q * p, 0);
  const tax = Math.round(subtotal * 5) / 100;
  const cell = 'border-bottom:1px solid #999;padding:7px 8px';
  return {
    title: 'Commercial Invoice',
    color: true,
    tilt: -0.2,
    handwritten: [],
    images: 2,
    planted: [
      ['单位名称', seller], ['统一社会信用代码', sellerTax], ['固定电话', phone], ['邮箱', s.email],
      ['单位名称', buyer], ['统一社会信用代码', buyerTax], ['姓名', b.name], ['地址', buyerAddress], ['手机', `+86-${b.mobile.replace(/[-\x20]/g, '')}`], ['邮箱', b.email],
    ],
    manual: [romanName(b.email), romanName(s.email)],
    html: `
<div style="padding:56px 60px;font-family:${SANS_EN};color:#111;font-size:13.5px;line-height:1.5">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div style="display:flex;gap:14px;align-items:flex-start">
    ${picture('logo-mark.png', 'width:62px;height:62px;object-fit:contain;mix-blend-mode:multiply')}
    <div>
      <div style="font:700 21px ${SERIF_EN}">JIAHONG INFORMATION CO., LTD.</div>
      <div style="font-family:${SANS};font-size:14px">${seller}</div>
      <div>5F., No. 390, Jianguo Rd., Chaoyang District, Beijing 100022, China</div>
      <div>Tel: ${phone}　VAT No.: ${sellerTax}</div>
    </div>
    </div>
    <div style="text-align:right;white-space:nowrap">
      <div style="font:700 28px ${SERIF_EN};letter-spacing:.06em">INVOICE</div>
      <div>Invoice No.: INV-2026-10-0457</div>
      <div>Date: Oct. 6, 2026</div>
      <div>Due Date: Nov. 5, 2026</div>
    </div>
  </div>
  <div style="display:flex;gap:28px;margin:22px 0 16px">
    <div style="flex:1;border:1px solid #777;padding:8px 12px">
      <div style="font-weight:700;margin-bottom:2px">BILL TO</div>
      <div>Attn: Ms. ${romanName(b.email)} (<span style="font-family:${SANS}">${b.name}</span>), Purchasing Manager</div>
      <div style="font-family:${SANS}">${buyer}（统一社会信用代码 ${buyerTax}）</div>
      <div style="font-family:${SANS}">${buyerAddress}</div>
      <div>Mobile: +86-${b.mobile.replace(/[-\x20]/g, '')}</div>
      <div>Email: ${b.email}</div>
    </div>
    <div style="width:210px;border:1px solid #777;padding:8px 12px">
      <div style="font-weight:700;margin-bottom:2px">PAYMENT TERMS</div>
      <div>Net 30 days</div>
      <div>Currency: USD</div>
      <div>PO No.: PO-2026-0398</div>
    </div>
  </div>
  <table style="border-collapse:collapse;width:100%">
    <tr style="background:#e6e6e6">${['No.', 'Description', 'Qty', 'Unit Price', 'Amount'].map((h, i) => `<th style="${cell};text-align:${i > 1 ? 'right' : 'left'}">${h}</th>`).join('')}</tr>
    ${items
      .map(([d, q, p], i) => `<tr><td style="${cell}">${i + 1}</td><td style="${cell}">${d}</td><td style="${cell};text-align:right">${q}</td><td style="${cell};text-align:right">${usd(p)}</td><td style="${cell};text-align:right">${usd(q * p)}</td></tr>`)
      .join('')}
  </table>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:12px">
  <div style="width:230px">
    ${picture('ssd-product.jpg', 'width:230px;height:160px;border:1px solid #bbb')}
    <div style="font-size:11.5px;color:#444;margin-top:4px">Item 3 — reference photo</div>
  </div>
  <table style="border-collapse:collapse;min-width:260px">
    <tr><td style="padding:3px 8px">Subtotal</td><td style="padding:3px 8px;text-align:right">${usd(subtotal)}</td></tr>
    <tr><td style="padding:3px 8px">Tax (5%)</td><td style="padding:3px 8px;text-align:right">${usd(tax)}</td></tr>
    <tr><td style="padding:3px 8px">Shipping</td><td style="padding:3px 8px;text-align:right">0.00</td></tr>
    <tr style="font-weight:700;border-top:2px solid #222"><td style="padding:5px 8px">TOTAL (USD)</td><td style="padding:5px 8px;text-align:right">${usd(subtotal + tax)}</td></tr>
  </table>
  </div>
  <div style="margin-top:18px;border-top:1px solid #777;padding-top:8px">
    <div style="font-weight:700">Remittance Information</div>
    <div>Bank: Industrial and Commercial Bank of China, Beijing Chaoyang Branch　SWIFT: ICBKCNBJ　Account No.: 0200-1234-5678-9012</div>
    <div>Please quote the invoice number with your payment. For billing questions, contact Mr. ${romanName(s.email)} at ${s.email}.</div>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-top:24px">
    <div style="text-align:center;width:230px">
      <div style="font:500 30px ${SCRIPT};color:#20306f;transform:rotate(-3deg)">${romanName(s.email)}</div>
      <div style="border-top:1px solid #222;padding-top:3px">Authorized Signature</div>
    </div>
  </div>
  <div style="position:absolute;bottom:40px;left:0;right:0;text-align:center;font-size:11px;color:#555">Page 4 of 5 — Thank you for your business.</div>
</div>`,
  };
}

// ---------------------------------------------------------------------------------------
// 5. 中英双语名片（彩色）
// ---------------------------------------------------------------------------------------
function cards(f: Fake): ScanPage {
  const titles: [string, string][] = [
    ['业务经理', 'Sales Manager'], ['项目经理', 'Project Manager'], ['财务总监', 'Chief Financial Officer'],
    ['资深工程师', 'Senior Engineer'], ['营销总监', 'Marketing Director'], ['客户服务专员', 'Customer Service Specialist'],
  ];
  const accents = ['#1e5aa8', '#b3261e', '#2e7d32', '#6a1b9a', '#ef6c00', '#00838f'];
  const tilts = [-1.1, 0.7, 0.9, -0.6, -0.8, 1.2];
  const planted: [Category, string][] = [];
  const manual: string[] = [];
  const list = titles.map(([zh, en], i) => {
    const p = person(f);
    const company = f.company();
    const tel = f.landline();
    const tax = f.uscc();
    const accent = accents[i];
    const roman = romanName(p.email);
    planted.push(['姓名', p.name], ['单位名称', company], ['固定电话', tel], ['手机', p.mobile], ['邮箱', p.email], ['地址', p.address]);
    if (i % 2 === 0) planted.push(['统一社会信用代码', tax]);
    manual.push(roman);
    const body =
      i % 2 === 0
        ? `<div style="display:flex;justify-content:space-between;align-items:flex-start">
             <div style="font:700 13px ${SANS};color:${accent}">${company}</div>
             <div style="width:26px;height:26px;border-radius:6px;background:${accent}"></div>
           </div>
           <div style="margin-top:10px;font:700 24px ${SANS};letter-spacing:.12em">${p.name}</div>
           <div style="font:12px ${SANS_EN};color:#444">${roman}｜${zh} ${en}</div>
           <div style="margin-top:10px;font:12.5px/1.55 ${SANS}">
             <div>电话 ${tel}　手机 ${p.mobile}</div>
             <div>${p.email}</div>
             <div>${p.address}</div>
             <div>统一社会信用代码 ${tax}</div>
           </div>`
        : `<div style="height:6px;background:${accent};margin:-14px -16px 10px"></div>
           <div style="font:700 20px ${SERIF_EN}">${roman}</div>
           <div style="font:12px ${SANS_EN};color:#444">${en}</div>
           <div style="margin-top:4px;font:15px ${SONG}">${p.name}　<span style="font-size:12px">${zh}</span></div>
           <div style="margin-top:8px;font:12.5px/1.55 ${SANS_EN}">
             <div>T: ${tel}　M: ${p.mobile}</div>
             <div>E: ${p.email}</div>
             <div style="font-family:${SANS}">${company}</div>
             <div style="font-family:${SANS}">${p.address}</div>
           </div>`;
    return `<div style="width:340px;height:204px;box-sizing:border-box;padding:14px 16px;background:#fff;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.35);transform:rotate(${tilts[i]}deg);overflow:hidden">${body}</div>`;
  });
  return {
    title: '名片扫描',
    color: true,
    tilt: 0.2,
    handwritten: [],
    images: 0,
    planted,
    manual,
    html: `
<div style="position:absolute;inset:0;background:#d9d7d2"></div>
<div style="position:relative;padding:70px 44px;display:grid;grid-template-columns:340px 340px;justify-content:space-between;row-gap:64px;color:#1a1a1a">
  ${list.join('\n')}
</div>`,
  };
}

/** The five pages in order; one seed so the sample is identical on every run. */
export function scanPages(seed = 404): ScanPage[] {
  const f = new Fake(seed);
  return [letter(f), form(f), roster(f), invoice(f), cards(f)];
}

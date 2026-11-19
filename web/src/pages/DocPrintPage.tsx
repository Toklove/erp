import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, message, Space, Spin } from 'antd';
import { PrinterOutlined, CloseOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { docApi, type DocLine } from '../api/doc';
import { COMPANY } from '../config/company';
import { fmtMoney, toChineseAmount } from '../utils/cn-money';
import qrcode from "../assets/qr.png";
import qrcode2 from "../assets/qr2.png";

/** 明细至少补齐到这么多行，针式纸上是常见做法 */
const MIN_ROWS = 0;

/**
 * 纸张宽度（mm），必须与 index.css 里 .print-sheet 的 width 保持一致。
 * 1in = 25.4mm = 96px，这个换算跟设备无关，所以能直接算出纸张的 CSS 像素宽度。
 */
const SHEET_WIDTH_MM = 225;
const SHEET_WIDTH_PX = (SHEET_WIDTH_MM / 25.4) * 96;

export default function DocPrintPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [printed, setPrinted] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /** 预览缩放倍率：1 表示按纸张原始大小预览 */
  const [previewScale, setPreviewScale] = useState(1);
  /** 缩放后容器需要补的高度（transform 不改变布局尺寸） */
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setDoc(await docApi.detail(Number(id)));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (doc) document.title = `${doc.docNo || ''} ${doc.docTypeName || ''}`;
  }, [doc]);

  /**
   * 手机 / 窄窗口预览：纸张是固定的 225mm，屏幕放不下时整体等比缩小，
   * 保证单据完整落在屏幕内，不会横向跑到屏幕外。
   *
   * 这里用 transform: scale() 而不是 zoom：zoom 是 2024 年才「新可用」的属性，
   * 仓库配的手持终端、旧版 iOS/Android WebView 上会失效，失效就直接横向溢出。
   * transform 只影响绘制、不影响布局（这是浏览器里最稳的做法），
   * 所以缩放后必须自己把容器高度补回来，否则下方会留一大块空白、也滚不动。
   */
  useLayoutEffect(() => {
    if (!doc) return;
    const shell = shellRef.current;
    if (!shell) return;

    const measure = () => {
      const cs = getComputedStyle(shell);
      const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const available = shell.clientWidth - padding;
      if (available <= 0) return;

      // 只缩不放；向下取整到三位小数，避免四舍五入后反而挤出 1px
      const raw = Math.min(1, available / SHEET_WIDTH_PX);
      const next = Math.floor(raw * 1000) / 1000;
      setPreviewScale(next);
      const sheetHeight = sheetRef.current?.offsetHeight || 0;
      setPreviewHeight(next < 1 ? Math.ceil(sheetHeight * next) + 1 : null);
    };

    measure();
    // 旋转屏幕、改窗口大小、明细行数变化都要重新量
    const ro = new ResizeObserver(measure);
    ro.observe(shell);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, [doc]);

  const lines: DocLine[] = doc?.lines || [];

  const rows = useMemo(() => {
    const filled = [...lines];
    while (filled.length < MIN_ROWS) filled.push({ lineNo: filled.length + 1 } as DocLine);
    return filled;
  }, [lines]);

  const pageTotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const paid = Number(doc?.paidAmount || 0);
  const owe = pageTotal - paid;

  const doPrint = async () => {
    if (!id) return;
    try {
      await docApi.printed(Number(id));
      setPrinted(true);
    } catch {
      /* 打印计数失败不阻断打印 */
    }
    window.setTimeout(() => window.print(), 120);
  };

  if (loading) {
    return (
      <div className="print-shell" style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!doc) {
    return <div className="print-shell">单据不存在</div>;
  }

  const scaled = previewScale < 1 && previewHeight != null;
  const sheetStyle: CSSProperties | undefined = scaled
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        // 绝对定位时两个 auto margin 的行为不直观，这里明确归零，让纸张左边缘对齐容器
        margin: 0,
        transform: `scale(${previewScale})`,
        transformOrigin: 'top left',
      }
    : undefined;

  return (
    <div className="print-shell" ref={shellRef}>
      <div className="print-toolbar">
        <Space>
          {printed && <span style={{ color: '#999', fontSize: 12 }}>已计入打印次数</span>}
          <Button icon={<CloseOutlined />} onClick={() => window.close()}>
            关闭
          </Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={doPrint}>
            打印
          </Button>
        </Space>
      </div>

      {/* 缩放容器：屏幕够宽时纸张保持 225mm 并居中；放不下时由 JS 缩放并补足高度 */}
      <div
        className={`print-preview${scaled ? ' is-scaled' : ''}`}
        style={scaled ? { height: previewHeight } : undefined}
      >
        <div className="print-sheet" ref={sheetRef} style={sheetStyle}>
<div>
          <div className="print-title">
          {COMPANY.name}
          {doc.docTypeName || '销售单'}
        </div>
        <div className="print-title-rule" />

        <div className="print-meta">
          <div className="print-meta-col">
            <div className="print-meta-row">
              <span className="print-meta-label">发货仓库：</span>
              <span className="print-meta-value">{doc.warehouseName || ''}</span>
            </div>
            <div className="print-meta-row">
              <span className="print-meta-label">客户名称：</span>
              <span className="print-meta-value">{doc.partnerName || ''}</span>
            </div>
            <div className="print-meta-row">
              <span className="print-meta-label">联系地址：</span>
              <span className="print-meta-value">{doc.contactAddress || ''}</span>
            </div>
          </div>
          <div className="print-meta-col">
            <div className="print-meta-row">
              <span className="print-meta-label">录单日期：</span>
              <span className="print-meta-value">{doc.bizDate || ''}</span>
            </div>
            <div className="print-meta-row">
              <span className="print-meta-label">单据编号：</span>
              <span className="print-meta-value">{doc.docNo || ''}</span>
            </div>
            <div className="print-meta-row">
              <span className="print-meta-label">联系电话：</span>
              <span className="print-meta-value">{doc.contactPhone || ''}</span>
            </div>
            <div className="print-meta-row">
              <span className="print-meta-label">摘　　要：</span>
              <span className="print-meta-value">{doc.summary || ''}</span>
            </div>
          </div>
        </div>

        <table className="print-table">
          <colgroup>
            <col style={{ width: '7%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>行号</th>
              <th>存货名称</th>
              <th>规格</th>
              <th>颜色</th>
              <th>单位</th>
              <th>数量</th>
              <th>单价</th>
              <th>金额</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i}>
                <td className="center">{l.itemName ? i + 1 : ''}</td>
                <td>{l.itemName || ''}</td>
                <td>{l.itemSpec || ''}</td>
                <td>{l.itemColor || ''}</td>
                <td className="center">{l.unitName || ''}</td>
                <td className="num">{l.itemName ? Number(l.qty || 0).toFixed(2) : ''}</td>
                <td className="num">{l.itemName ? fmtMoney(l.price) : ''}</td>
                <td className="num">{l.itemName ? fmtMoney(l.amount) : ''}</td>
                <td>{l.remark || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
</div>

        <div className="">
          <div>
          <div className="print-foot-line">
            <div>
            <img src={qrcode} alt="Logo" width="100px" height="100px" /><img src={qrcode2} alt="Logo" width="100px" height="100px" />
            </div>
           <div>
             <span>
              合计：<b>{toChineseAmount(pageTotal)}</b>
            </span>
            <br></br>
            <span>
              页小计：<b>{fmtMoney(pageTotal)}</b>
            </span>
            <br></br>
               <span>
              欠款金额：<b>{fmtMoney(owe)}</b>
            </span>
            <br></br>
            <span>备注：{doc.remark || ''}</span>
           </div>
          </div>
    
          <div className="print-foot-line" style={{ marginTop: 4 }}>
            <span>收款账户：{COMPANY.bankAccount || '＿＿＿＿＿＿＿＿＿＿＿＿'}</span>
            <span>地址：{COMPANY.address}</span>
          </div>
          <div className="print-sign">
            <span className="print-sign-item">制单人：{doc.creatorName || ''}</span>
            <span className="print-sign-item">经手人：{doc.handler || ''}</span>
            <span className="print-sign-item">客户签字：＿＿＿＿＿＿＿＿</span>
          </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

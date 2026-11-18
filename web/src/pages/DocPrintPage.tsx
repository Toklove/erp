import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function DocPrintPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [printed, setPrinted] = useState(false);

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

  return (
    <div className="print-shell">
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

      <div className="print-sheet">
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

        <div className="print-foot">
          <div className="print-foot-line">
            <span>
              合计：<b>{toChineseAmount(pageTotal)}</b>
            </span>
            <span>
              页小计：<b>{fmtMoney(pageTotal)}</b>
            </span>
          </div>
          <div className="print-foot-line">
            <span />
            <span>
              欠款金额：<b>{fmtMoney(owe)}</b>
            </span>
          </div>
          <div><img src={qrcode} alt="Logo" width="100px" height="100px" /><img src={qrcode2} alt="Logo" width="100px" height="100px" /></div>
          <div className="print-foot-line" style={{ marginTop: 4 }}>
            <span>收款账户：{COMPANY.bankAccount || '＿＿＿＿＿＿＿＿＿＿＿＿'}</span>
            <span>地址：{COMPANY.address}</span>
          </div>
          <div className="print-foot-line">
            <span>备注：{doc.remark || ''}</span>
          </div>
          <div className="print-sign">
            <span className="print-sign-item">制单人：{doc.creatorName || ''}</span>
            <span className="print-sign-item">经手人：{doc.handler || ''}</span>
            <span className="print-sign-item">客户签字：＿＿＿＿＿＿＿＿</span>
          </div>
        </div>
      </div>
    </div>
  );
}

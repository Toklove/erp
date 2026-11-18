import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Divider, message, Space, Table, Tag } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EditOutlined,
  PrinterOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams } from 'react-router-dom';
import { docApi, type DocHead, type DocLine } from '../api/doc';
import { useIsMobile } from '../hooks/useIsMobile';
import { fmtMoney, toChineseAmount } from '../utils/cn-money';

const STATUS: Record<number, { text: string; color: string }> = {
  0: { text: '草稿', color: 'default' },
  1: { text: '已审核', color: 'blue' },
  2: { text: '已过账', color: 'green' },
  9: { text: '已作废', color: 'red' },
};

export default function DocViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [doc, setDoc] = useState<DocHead | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setDoc(await docApi.detail(Number(id)));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      message.success(ok);
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns: ColumnsType<DocLine> = [
    { title: '行号', dataIndex: 'lineNo', width: 60, align: 'center' },
    { title: '存货名称', dataIndex: 'itemName', width: 220 },
    { title: '规格', dataIndex: 'itemSpec', width: 140, render: v => v || '-' },
    { title: '颜色', dataIndex: 'itemColor', width: 100, render: v => v || '-' },
    { title: '单位', dataIndex: 'unitName', width: 70 },
    {
      title: '数量',
      dataIndex: 'qty',
      width: 100,
      align: 'right',
      render: (v: string) => Number(v || 0).toFixed(2),
    },
    {
      title: '单价',
      dataIndex: 'price',
      width: 110,
      align: 'right',
      render: (v: string) => fmtMoney(v),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 120,
      align: 'right',
      render: (v: string) => fmtMoney(v),
    },
    { title: '备注', dataIndex: 'remark', render: v => v || '-' },
  ];

  const lines = doc?.lines || [];
  const totalAmount = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const status = STATUS[Number(doc?.status ?? 0)] || { text: '-', color: 'default' };

  return (
    <Card
      loading={loading}
      title={
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/doc')} />
          <span>单据详情</span>
          <Tag color={status.color}>{status.text}</Tag>
        </Space>
      }
      extra={
        <Space wrap size={isMobile ? 4 : 8}>
          {(doc?.status === 0 || doc?.status === 1) && (
            <Button
              icon={<EditOutlined />}
              size={isMobile ? 'small' : 'middle'}
              onClick={() => navigate(`/doc/edit/${doc?.id}`)}
            >
              编辑
            </Button>
          )}
          {(doc?.status === 0 || doc?.status === 1) && (
            <Button
              icon={<CheckCircleOutlined />}
              size={isMobile ? 'small' : 'middle'}
              onClick={() =>
                act(
                  () => docApi.audit(Number(doc?.id)),
                  doc?.status === 1 ? '已反审核' : '审核通过'
                )
              }
            >
              {doc?.status === 1 ? '反审核' : '审核'}
            </Button>
          )}
          {doc?.status === 1 && (
            <Button
              icon={<SendOutlined />}
              size={isMobile ? 'small' : 'middle'}
              onClick={() => act(() => docApi.post(Number(doc?.id)), '过账成功')}
            >
              过账
            </Button>
          )}
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            size={isMobile ? 'small' : 'middle'}
            onClick={() => window.open(`/doc/print/${doc?.id}`, '_blank')}
          >
            打印
          </Button>
        </Space>
      }
    >
      <Descriptions bordered size="small" column={isMobile ? 1 : 3}>
        <Descriptions.Item label="单据编号">{doc?.docNo}</Descriptions.Item>
        <Descriptions.Item label="单据类型">{doc?.docTypeName}</Descriptions.Item>
        <Descriptions.Item label="单据日期">{doc?.bizDate}</Descriptions.Item>
        <Descriptions.Item label="往来单位">{doc?.partnerName || '-'}</Descriptions.Item>
        <Descriptions.Item label="联系电话">{doc?.contactPhone || '-'}</Descriptions.Item>
        <Descriptions.Item label="发货仓库">{doc?.warehouseName || '-'}</Descriptions.Item>
        <Descriptions.Item label="联系地址" span={isMobile ? 1 : 2}>
          {doc?.contactAddress || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="部门">{doc?.department || '-'}</Descriptions.Item>
        <Descriptions.Item label="摘要" span={isMobile ? 1 : 2}>
          {doc?.summary || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="备注">{doc?.remark || '-'}</Descriptions.Item>
        <Descriptions.Item label="制单人">{doc?.creatorName || '-'}</Descriptions.Item>
        <Descriptions.Item label="经办人">{doc?.handler || '-'}</Descriptions.Item>
        <Descriptions.Item label="修改人">{doc?.modifierName || '-'}</Descriptions.Item>
        <Descriptions.Item label="打印次数">{doc?.printCount ?? 0}</Descriptions.Item>
        <Descriptions.Item label="保存时间">{doc?.createdAt || '-'}</Descriptions.Item>
        <Descriptions.Item label="审核时间">{doc?.auditedAt || '-'}</Descriptions.Item>
      </Descriptions>

      <Divider titlePlacement="left">单据明细</Divider>

      <Table<DocLine>
        rowKey={r => String(r.id ?? r.lineNo)}
        size="small"
        pagination={false}
        columns={columns}
        dataSource={lines}
        scroll={{ x: 1000 }}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={7} align="right">
              <b>合计</b>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">
              <b>{fmtMoney(totalAmount)}</b>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={8} />
          </Table.Summary.Row>
        )}
      />
      <div className="doc-total-bar">
        <Space size={32}>
          <span>大写：{toChineseAmount(totalAmount)}</span>
          <span>已收：{fmtMoney(doc?.paidAmount)}</span>
          <span>
            欠款：<b>{fmtMoney(totalAmount - Number(doc?.paidAmount || 0))}</b>
          </span>
        </Space>
      </div>
    </Card>
  );
}

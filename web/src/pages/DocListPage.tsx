import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { docApi, type DocHead, type DocTypeOption } from '../api/doc';
import { useIsMobile } from '../hooks/useIsMobile';
import { fmtMoney } from '../utils/cn-money';

const { RangePicker } = DatePicker;

const STATUS: Record<number, { text: string; color: string }> = {
  0: { text: '草稿', color: 'default' },
  1: { text: '已审核', color: 'blue' },
  2: { text: '已过账', color: 'green' },
  9: { text: '已作废', color: 'red' },
};

export default function DocListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<DocHead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState<DocTypeOption[]>([]);

  const [keyword, setKeyword] = useState('');
  const [docType, setDocType] = useState<string | undefined>();
  const [status, setStatus] = useState<number | undefined>();
  const [range, setRange] = useState<[string, string] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await docApi.page({
        keyword,
        docType,
        status,
        dateFrom: range?.[0],
        dateTo: range?.[1],
        page,
        pageSize,
      });
      setRows(res.rows || []);
      setTotal(res.total || 0);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [keyword, docType, status, range, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    docApi.types().then(setTypes).catch(() => undefined);
  }, []);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      message.success(ok);
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const openPrint = (id?: number) => {
    if (!id) return;
    window.open(`/doc/print/${id}`, '_blank', 'noopener');
  };

  const columns: ColumnsType<DocHead> = [
    {
      title: '单据编号',
      dataIndex: 'docNo',
      width: 190,
      render: (v: string, r) => (
        <a onClick={() => navigate(`/doc/view/${r.id}`)}>{v}</a>
      ),
    },
    { title: '日期', dataIndex: 'bizDate', width: 110 },
    { title: '类型', dataIndex: 'docTypeName', width: 100 },
    { title: '往来单位', dataIndex: 'partnerName', width: 160, ellipsis: true },
    { title: '仓库', dataIndex: 'warehouseName', width: 110, ellipsis: true },
    {
      title: '数量',
      dataIndex: 'totalQty',
      width: 90,
      align: 'right',
      render: (v: string) => Number(v || 0).toFixed(2),
    },
    {
      title: '金额',
      dataIndex: 'totalAmount',
      width: 120,
      align: 'right',
      render: (v: string) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(v)}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: number) => {
        const s = STATUS[v] || { text: String(v), color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    { title: '经办人', dataIndex: 'handler', width: 90 },
    { title: '制单人', dataIndex: 'creatorName', width: 90 },
    {
      title: '打印',
      dataIndex: 'printCount',
      width: 70,
      align: 'center',
      render: (v: number) => (v ? `${v} 次` : '-'),
    },
    {
      title: '操作',
      key: 'op',
      width: 300,
      fixed: 'right',
      render: (_, r) => {
        const editable = r.status === 0 || r.status === 1;
        return (
          <Space size={4} wrap>
            <Button size="small" type="link" onClick={() => navigate(`/doc/view/${r.id}`)}>
              查看
            </Button>
            {editable && (
              <Button size="small" type="link" onClick={() => navigate(`/doc/edit/${r.id}`)}>
                编辑
              </Button>
            )}
            {(r.status === 0 || r.status === 1) && (
              <Button
                size="small"
                type="link"
                onClick={() =>
                  act(
                    () => docApi.audit(r.id!),
                    r.status === 1 ? '已反审核' : '审核通过'
                  )
                }
              >
                {r.status === 1 ? '反审核' : '审核'}
              </Button>
            )}
            {r.status === 1 && (
              <Button size="small" type="link" onClick={() => act(() => docApi.post(r.id!), '过账成功')}>
                过账
              </Button>
            )}
            <Button size="small" type="link" icon={<PrinterOutlined />} onClick={() => openPrint(r.id)}>
              打印
            </Button>
            {r.status !== 2 && (
              <Popconfirm title="确定作废这张单据？" onConfirm={() => act(() => docApi.void(r.id!), '已作废')}>
                <Button size="small" type="link" danger>
                  作废
                </Button>
              </Popconfirm>
            )}
            {r.status !== 2 && (
              <Popconfirm title="确定删除？删除后不可恢复" onConfirm={() => act(() => docApi.remove(r.id!), '已删除')}>
                <Button size="small" type="link" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      title="业务单据"
      extra={
        <Space size={8}>
          <Button icon={<ReloadOutlined />} onClick={load} size={isMobile ? 'small' : 'middle'}>
            {isMobile ? '' : '刷新'}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/doc/edit')}
            size={isMobile ? 'small' : 'middle'}
          >
            新建
          </Button>
        </Space>
      }
    >
      <Space wrap style={{ marginBottom: 16, width: '100%' }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="单号 / 往来单位 / 摘要"
          style={{ width: isMobile ? '100%' : 240 }}
          value={keyword}
          onChange={e => {
            setKeyword(e.target.value);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="单据类型"
          style={{ width: isMobile ? 'calc(50% - 4px)' : 140 }}
          value={docType}
          onChange={v => {
            setDocType(v);
            setPage(1);
          }}
          options={types.map(t => ({ value: t.name, label: t.name }))}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: isMobile ? 'calc(50% - 4px)' : 120 }}
          value={status}
          onChange={v => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.entries(STATUS).map(([k, v]) => ({ value: Number(k), label: v.text }))}
        />
        <RangePicker
          allowClear
          style={{ width: isMobile ? '100%' : undefined }}
          onChange={v => {
            if (!v || !v[0] || !v[1]) {
              setRange(null);
            } else {
              setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')]);
            }
            setPage(1);
          }}
        />
      </Space>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1480 }}
        pagination={{
          current: page,
          pageSize,
          total,
          simple: isMobile,
          showSizeChanger: !isMobile,
          showTotal: t => `共 ${t} 张单据`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </Card>
  );
}

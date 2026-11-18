import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { createItem, deleteItem, pageItems, updateItem, type Item } from '../api/md';
import { useIsMobile } from '../hooks/useIsMobile';

export default function ItemListPage() {
  const { message, modal } = App.useApp();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pageItems({ keyword, page, pageSize });
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (row: Item) => {
    setEditing(row);
    form.setFieldsValue({ ...row, refCost: Number(row.refCost) });
    setOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateItem(editing.id, values);
        message.success('保存成功');
      } else {
        await createItem(values);
        message.success('新增成功');
      }
      setOpen(false);
      void load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const onDelete = (row: Item) => {
    modal.confirm({
      title: `确认删除物料 ${row.code}？`,
      content: '删除为软删除，历史单据不受影响。',
      onOk: async () => {
        try {
          await deleteItem(row.id);
          message.success('已删除');
          void load();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const columns: ColumnsType<Item> = [
    { title: '编码', dataIndex: 'code', width: 140, fixed: 'left' },
    { title: '名称', dataIndex: 'name', width: 220 },
    { title: '规格', dataIndex: 'spec', width: 180, render: v => v || '-' },
    { title: '条码', dataIndex: 'barcode', width: 150, render: v => v || '-' },
    {
      title: '参考成本',
      dataIndex: 'refCost',
      width: 120,
      align: 'right',
      render: (v: string) => Number(v).toFixed(2),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: number) => (v === 1 ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <a onClick={() => openEdit(row)}>编辑</a>
          <a onClick={() => onDelete(row)}>删除</a>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16, width: '100%' }}>
        <Input.Search
          placeholder="编码 / 名称 / 条码"
          allowClear
          style={{ width: isMobile ? '100%' : 260 }}
          onSearch={v => {
            setPage(1);
            setKeyword(v);
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增物料
        </Button>
      </Space>

      <Table<Item>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1000 }}
        pagination={{
          current: page,
          pageSize,
          total,
          simple: isMobile,
          showSizeChanger: !isMobile,
          showTotal: t => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <Modal
        title={editing ? '编辑物料' : '新增物料'}
        open={open}
        onOk={onSubmit}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        width={isMobile ? '100%' : 520}
        style={isMobile ? { top: 8, maxWidth: '100vw', paddingBottom: 0 } : undefined}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input disabled={!!editing} placeholder="编码启用后不可修改" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="spec" label="规格型号">
            <Input />
          </Form.Item>
          <Form.Item name="barcode" label="条码">
            <Input />
          </Form.Item>
          <Form.Item name="baseUnitId" label="基本单位 ID" initialValue={1}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="refCost" label="参考成本">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

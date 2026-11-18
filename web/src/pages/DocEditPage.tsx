import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { docApi, mdApi, type DocHead, type DocLine, type DocTypeOption, type WarehouseOption } from '../api/doc';
import { getUser } from '../api/client';
import AutoCompleteInput from '../components/AutoCompleteInput';
import { useIsMobile } from '../hooks/useIsMobile';
import { fmtMoney, toChineseAmount } from '../utils/cn-money';

interface LineRow {
  key: string;
  itemId?: number;
  itemName: string;
  itemSpec: string;
  itemColor: string;
  unitName: string;
  qty: number;
  price: number;
  remark: string;
}

const newLine = (): LineRow => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  itemName: '',
  itemSpec: '',
  itemColor: '',
  unitName: '',
  qty: 1,
  price: 0,
  remark: '',
});

const amountOf = (l: LineRow) => Math.round((Number(l.qty) || 0) * (Number(l.price) || 0) * 10000) / 10000;

export default function DocEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const editingId = id ? Number(id) : undefined;
  const currentUser = getUser<{ username: string; realName?: string }>();

  const [types, setTypes] = useState<DocTypeOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const [docTypeCode, setDocTypeCode] = useState('XS');
  const [bizDate, setBizDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [docNo, setDocNo] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [summary, setSummary] = useState('');
  const [handler, setHandler] = useState(currentUser?.realName || currentUser?.username || '');
  const [department, setDepartment] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [remark, setRemark] = useState('');
  const [lines, setLines] = useState<LineRow[]>([newLine()]);
  const [status, setStatus] = useState(0);

  useEffect(() => {
    docApi.types().then(setTypes).catch(() => undefined);
    mdApi.warehouses().then(list => {
      setWarehouses(list);
      if (!editingId && list.length) setWarehouseId(list[0].id);
    }).catch(() => undefined);
  }, [editingId]);

  const loadDetail = useCallback(async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      const d = await docApi.detail(editingId);
      setDocNo(d.docNo || '');
      setDocTypeCode(d.docTypeCode || 'XS');
      setBizDate(d.bizDate || dayjs().format('YYYY-MM-DD'));
      setPartnerName(d.partnerName || '');
      setContactPhone(d.contactPhone || '');
      setContactAddress(d.contactAddress || '');
      setWarehouseId(d.warehouseId || undefined);
      setSummary(d.summary || '');
      setHandler(d.handler || '');
      setDepartment(d.department || '');
      setPaidAmount(Number(d.paidAmount || 0));
      setRemark(d.remark || '');
      setStatus(Number(d.status || 0));
      setLines(
        (d.lines || []).map((l: DocLine) => ({
          key: `l${l.id}`,
          itemId: l.itemId,
          itemName: l.itemName || '',
          itemSpec: l.itemSpec || '',
          itemColor: l.itemColor || '',
          unitName: l.unitName || '',
          qty: Number(l.qty || 0),
          price: Number(l.price || 0),
          remark: l.remark || '',
        }))
      );
      if (!d.lines?.length) setLines([newLine()]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [editingId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const patch = (key: string, p: Partial<LineRow>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...p } : l)));

  const totalQty = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty) || 0), 0),
    [lines]
  );
  const totalAmount = useMemo(
    () => Math.round(lines.reduce((s, l) => s + amountOf(l), 0) * 10000) / 10000,
    [lines]
  );

  /** 选中存货后带出规格 / 颜色 / 单位 / 上一次单价 */
  const onPickItem = async (key: string, name: string) => {
    try {
      const hint = await docApi.itemHint(name);
      if (!hint) return;
      patch(key, {
        itemSpec: hint.itemSpec || '',
        itemColor: hint.itemColor || '',
        unitName: hint.unitName || '',
        price: Number(hint.price || 0),
      });
    } catch {
      /* 补全失败不影响录入 */
    }
  };

  /** 选中往来单位后尝试带出电话和地址 */
  const onPickPartner = (name: string) => {
    if (!name) return;
    mdApi
      .partners(name)
      .then(list => {
        const hit = list.find(p => p.name === name);
        if (hit) {
          if (hit.phone) setContactPhone(hit.phone);
          if (hit.address) setContactAddress(hit.address);
        }
      })
      .catch(() => undefined);
  };

  const onSave = async () => {
    const valid = lines.filter(l => l.itemName.trim());
    if (!valid.length) {
      message.warning('请至少填写一行存货');
      return;
    }
    const wh = warehouses.find(w => w.id === warehouseId);
    const payload: DocHead = {
      docTypeCode,
      bizDate,
      partnerName: partnerName.trim(),
      contactPhone,
      contactAddress,
      warehouseId,
      warehouseName: wh?.name || '',
      summary,
      handler,
      department,
      paidAmount,
      remark,
      lines: valid.map((l, i) => ({
        lineNo: i + 1,
        itemId: l.itemId,
        itemName: l.itemName.trim(),
        itemSpec: l.itemSpec,
        itemColor: l.itemColor,
        unitName: l.unitName,
        qty: l.qty,
        price: l.price,
        warehouseId,
        remark: l.remark,
      })),
    };

    setSaving(true);
    try {
      if (editingId) {
        await docApi.update(editingId, payload);
        message.success('保存成功');
        navigate(`/doc/view/${editingId}`);
      } else {
        const res = await docApi.create(payload);
        message.success(`创建成功：${(res as { docNo?: string }).docNo || ''}`);
        navigate('/doc');
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<LineRow> = [
    {
      title: '行号',
      width: 60,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: '存货名称',
      dataIndex: 'itemName',
      width: 240,
      render: (v: string, r) => (
        <AutoCompleteInput
          field="item"
          value={v}
          onChange={val => patch(r.key, { itemName: val })}
          onPick={val => onPickItem(r.key, val)}
          placeholder="输入名称，可选历史存货"
          size="small"
        />
      ),
    },
    {
      title: '规格',
      dataIndex: 'itemSpec',
      width: 150,
      render: (v: string, r) => (
        <AutoCompleteInput
          field="spec"
          value={v}
          onChange={val => patch(r.key, { itemSpec: val })}
          size="small"
        />
      ),
    },
    {
      title: '颜色',
      dataIndex: 'itemColor',
      width: 110,
      render: (v: string, r) => (
        <AutoCompleteInput
          field="color"
          value={v}
          onChange={val => patch(r.key, { itemColor: val })}
          size="small"
        />
      ),
    },
    {
      title: '单位',
      dataIndex: 'unitName',
      width: 80,
      render: (v: string, r) => (
        <Input
          size="small"
          value={v}
          onChange={e => patch(r.key, { unitName: e.target.value })}
        />
      ),
    },
    {
      title: '数量',
      dataIndex: 'qty',
      width: 100,
      render: (v: number, r) => (
        <InputNumber
          size="small"
          min={0}
          precision={4}
          style={{ width: '100%' }}
          value={v}
          onChange={val => patch(r.key, { qty: Number(val) || 0 })}
        />
      ),
    },
    {
      title: '单价',
      dataIndex: 'price',
      width: 110,
      render: (v: number, r) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          style={{ width: '100%' }}
          value={v}
          onChange={val => patch(r.key, { price: Number(val) || 0 })}
        />
      ),
    },
    {
      title: '金额',
      width: 120,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(amountOf(r))}</span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 140,
      render: (v: string, r) => (
        <Input
          size="small"
          value={v}
          onChange={e => patch(r.key, { remark: e.target.value })}
        />
      ),
    },
    {
      title: '',
      width: 50,
      render: (_, r) => (
        <Tooltip title="删除本行">
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            disabled={lines.length <= 1}
            onClick={() => setLines(prev => prev.filter(l => l.key !== r.key))}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Card
      loading={loading}
      title={
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
          <span>{editingId ? `编辑单据 ${docNo}` : '新建单据'}</span>
          {editingId && <Tag color={status === 2 ? 'green' : 'default'}>状态 {status}</Tag>}
        </Space>
      }
      extra={
        <Space size={8}>
          <Button onClick={() => navigate('/doc')} size={isMobile ? 'small' : 'middle'}>
            {isMobile ? '返回' : '返回列表'}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={onSave}
            size={isMobile ? 'small' : 'middle'}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Row gutter={16}>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">单据类型</div>
          <Select
            style={{ width: '100%' }}
            value={docTypeCode}
            onChange={setDocTypeCode}
            options={types.map(t => ({ value: t.code, label: t.name }))}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">单据编号</div>
          <Input value={docNo} placeholder={editingId ? '' : '保存后自动生成'} disabled />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">单据日期</div>
          <DatePicker
            style={{ width: '100%' }}
            value={dayjs(bizDate)}
            onChange={d => setBizDate(d ? d.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'))}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">发货仓库</div>
          <Select
            style={{ width: '100%' }}
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder="选择仓库"
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
          />
        </Col>

        <Col xs={24} sm={12} md={6}>
          <div className="field-label">往来单位</div>
          <AutoCompleteInput
            field="partner"
            value={partnerName}
            onChange={setPartnerName}
            onPick={onPickPartner}
            placeholder="输入客户/供应商名称"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">联系电话</div>
          <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">经办人</div>
          <AutoCompleteInput field="handler" value={handler} onChange={setHandler} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">部门</div>
          <Input value={department} onChange={e => setDepartment(e.target.value)} />
        </Col>

        <Col xs={24} md={12}>
          <div className="field-label">联系地址</div>
          <Input value={contactAddress} onChange={e => setContactAddress(e.target.value)} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">已收金额</div>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            precision={2}
            value={paidAmount}
            onChange={v => setPaidAmount(Number(v) || 0)}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="field-label">摘要</div>
          <AutoCompleteInput
            field="summary"
            value={summary}
            onChange={setSummary}
            placeholder="如：杨霞 1.5*2米"
          />
        </Col>

        <Col span={24} style={{ marginTop: 8 }}>
          <div className="field-label">备注</div>
          <Input value={remark} onChange={e => setRemark(e.target.value)} />
        </Col>
      </Row>

      <Divider titlePlacement="left" style={{ marginTop: 24 }}>
        单据明细
      </Divider>

      {isMobile ? (
        /* 手机上明细表宽度 1250px 根本没法填，改成一行一张卡片 */
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {lines.map((l, index) => (
            <Card
              key={l.key}
              size="small"
              title={`第 ${index + 1} 行`}
              extra={
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={lines.length <= 1}
                  onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))}
                />
              }
            >
              <Row gutter={[8, 8]}>
                <Col span={24}>
                  <div className="field-label">存货名称</div>
                  <AutoCompleteInput
                    field="item"
                    value={l.itemName}
                    onChange={val => patch(l.key, { itemName: val })}
                    onPick={val => onPickItem(l.key, val)}
                    placeholder="输入名称，可选历史存货"
                  />
                </Col>
                <Col span={12}>
                  <div className="field-label">规格</div>
                  <AutoCompleteInput
                    field="spec"
                    value={l.itemSpec}
                    onChange={val => patch(l.key, { itemSpec: val })}
                  />
                </Col>
                <Col span={12}>
                  <div className="field-label">颜色</div>
                  <AutoCompleteInput
                    field="color"
                    value={l.itemColor}
                    onChange={val => patch(l.key, { itemColor: val })}
                  />
                </Col>
                <Col span={8}>
                  <div className="field-label">单位</div>
                  <Input
                    value={l.unitName}
                    onChange={e => patch(l.key, { unitName: e.target.value })}
                  />
                </Col>
                <Col span={8}>
                  <div className="field-label">数量</div>
                  <InputNumber
                    min={0}
                    precision={4}
                    style={{ width: '100%' }}
                    value={l.qty}
                    onChange={val => patch(l.key, { qty: Number(val) || 0 })}
                  />
                </Col>
                <Col span={8}>
                  <div className="field-label">单价</div>
                  <InputNumber
                    min={0}
                    precision={2}
                    style={{ width: '100%' }}
                    value={l.price}
                    onChange={val => patch(l.key, { price: Number(val) || 0 })}
                  />
                </Col>
                <Col span={24}>
                  <div className="field-label">金额</div>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(amountOf(l))}</b>
                </Col>
                <Col span={24}>
                  <div className="field-label">备注</div>
                  <Input
                    value={l.remark}
                    onChange={e => patch(l.key, { remark: e.target.value })}
                  />
                </Col>
              </Row>
            </Card>
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => setLines(prev => [...prev, newLine()])}
          >
            添加一行
          </Button>
        </Space>
      ) : (
        <Table<LineRow>
          rowKey="key"
          size="small"
          pagination={false}
          columns={columns}
          dataSource={lines}
          scroll={{ x: 1250 }}
          footer={() => (
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={() => setLines(prev => [...prev, newLine()])}
            >
              添加一行
            </Button>
          )}
        />
      )}

      <div className="doc-total-bar">
        <Space size={32}>
          <span>
            合计数量：<b>{totalQty.toFixed(2)}</b>
          </span>
          <span>
            合计金额：<b style={{ fontSize: 18 }}>{fmtMoney(totalAmount)}</b>
          </span>
          <span style={{ color: '#888' }}>大写：{toChineseAmount(totalAmount)}</span>
        </Space>
      </div>
    </Card>
  );
}

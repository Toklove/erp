import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Input,
  Radio,
  Row,
  Segmented,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import {
  CloudUploadOutlined,
  FileSearchOutlined,
  ImportOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  importApi,
  type ImportPreview,
  type ImportResult,
  type ImportSample,
  type ImportOptions,
} from '../api/import';
import { useIsMobile } from '../hooks/useIsMobile';

const { TextArea } = Input;
const { Text, Title } = Typography;

const SAMPLE_JSON = `{
  "单据": [
    { "日期": "2022-12-07T00:00:00", "单据编号": "XS-2022-12-07-00001", "单据类型": "销售单",
      "往来单位": "杭州街鸿康家具", "金额": 2200, "摘要": "杨霞 1.5*2米",
      "审核状态": "已审核", "制单人": "陈万群", "打印次数": 1 }
  ],
  "单据详情": [
    { "日期": "2022-12-08T00:00:00", "单据类型": "销售订单", "单据编号": "SD-2022-12-08-00003",
      "仓库全名": "仓库", "存货全名": "伟东茶几G56-130", "数量": 2, "金额": 900,
      "行摘要": "伟东茶几G56-130", "制单人": "陈万群", "基本单位": "个" }
  ],
  "草稿": [
    { "日期": "2022-12-09T00:00:00", "单据编号": "XS-2022-12-09-00009", "单据类型": "销售单",
      "往来单位": "杭州街鸿康家具", "金额": 1200, "摘要": "待确认",
      "制单人": "黄春花", "经办人": "陈万群", "部门全名": "销售部" }
  ]
}`;

export default function ImportPage() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');

  const [mode, setMode] = useState<'skip' | 'replace'>('skip');
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [autoCreateItems, setAutoCreateItems] = useState(true);
  const [autoCreatePartners, setAutoCreatePartners] = useState(true);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'execute' | null>(null);

  const options: ImportOptions = useMemo(
    () => ({ mode, includeDrafts, autoCreateItems, autoCreatePartners, autoCreateDocTypes: true }),
    [mode, includeDrafts, autoCreateItems, autoCreatePartners]
  );

  /** 解析文本 → 二选一：成功返回对象并把错误提示给用户 */
  const parse = (): unknown | null => {
    const text = rawText.trim();
    if (!text) {
      message.warning('请先粘贴或上传管家婆导出的 JSON');
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      message.error('JSON 解析失败：' + (e as Error).message);
      return null;
    }
  };

  const onPreview = async () => {
    const payload = parse();
    if (!payload) return;
    setBusy('preview');
    setResult(null);
    try {
      const p = await importApi.preview(payload, options);
      setPreview(p);
      message.success(`预览完成：${p.docsTotal} 张单据，其中新建 ${p.docsNew} 张`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onExecute = async () => {
    const payload = parse();
    if (!payload) return;
    setBusy('execute');
    try {
      const r = await importApi.execute(payload, options);
      setResult(r);
      setPreview(null);
      message.success(`导入完成：新建 ${r.created} 张，覆盖 ${r.replaced} 张，跳过 ${r.skipped} 张`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** 允许直接选 .json 文件，读进文本框后走同一套流程 */
  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setRawText(String(reader.result || ''));
      setFileName(file.name);
      setTab('paste');
      message.success(`已读取 ${file.name}`);
    };
    reader.onerror = () => message.error('文件读取失败');
    reader.readAsText(file, 'utf-8');
    return false;
  };

  const sampleColumns: ColumnsType<ImportSample> = [
    {
      title: '处理',
      dataIndex: 'action',
      width: 80,
      render: (v: ImportSample['action']) => {
        const map = { create: ['green', '新建'], replace: ['orange', '覆盖'], skip: ['default', '跳过'] };
        const [color, text] = map[v] || ['default', v];
        return <Tag color={color}>{text}</Tag>;
      },
    },
    { title: '单据编号', dataIndex: 'docNo', width: 190 },
    { title: '类型', dataIndex: 'docTypeName', width: 100 },
    { title: '日期', dataIndex: 'bizDate', width: 110 },
    { title: '往来单位', dataIndex: 'partnerName', width: 160, ellipsis: true },
    { title: '明细行', dataIndex: 'lineCount', width: 80, align: 'right' },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 110,
      align: 'right',
      render: (v: string) => Number(v || 0).toFixed(2),
    },
  ];

  const tagList = (title: string, list: string[], color?: string) => (
    <div style={{ marginBottom: 8 }}>
      <Text type="secondary">{title}：</Text>
      {list.length ? (
        list.map(v => (
          <Tag key={v} color={color}>
            {v}
          </Tag>
        ))
      ) : (
        <Text type="secondary">（无）</Text>
      )}
    </div>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        size="small"
        title={
          <Space>
            <CloudUploadOutlined />
            <span>数据来源</span>
            {fileName && <Tag>{fileName}</Tag>}
          </Space>
        }
        extra={
          <Segmented
            value={tab}
            onChange={v => setTab(v as 'paste' | 'upload')}
            options={[
              { label: '粘贴 JSON', value: 'paste' },
              { label: '上传文件', value: 'upload' },
            ]}
          />
        }
      >
        {tab === 'paste' ? (
          <TextArea
            rows={isMobile ? 8 : 12}
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="把管家婆导出的三张表（单据 / 单据详情 / 草稿）粘贴到这里，支持顶层数组或 {单据: [], 单据详情: [], 草稿: []}"
            style={{ fontFamily: 'Consolas, Menlo, monospace', fontSize: 12 }}
          />
        ) : (
          <Upload.Dragger beforeUpload={onUpload} showUploadList={false} accept=".json,application/json">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 .json 文件到这里</p>
            <p className="ant-upload-hint">文件只在本地读取，随后按下方选项导入数据库</p>
          </Upload.Dragger>
        )}

        <Space wrap style={{ marginTop: 8 }}>
          <Button size="small" type="link" onClick={() => setRawText(SAMPLE_JSON)}>
            填入示例数据
          </Button>
          <Button size="small" type="link" onClick={() => { setRawText(''); setFileName(''); setPreview(null); setResult(null); }}>
            清空
          </Button>
        </Space>
      </Card>

      <Card size="small" title="导入选项">
        <Row gutter={[16, 12]}>
          <Col xs={24} md={8}>
            <div className="field-label">重复单据处理</div>
            <Radio.Group value={mode} onChange={e => setMode(e.target.value)} optionType="button">
              <Radio.Button value="skip">跳过已存在</Radio.Button>
              <Radio.Button value="replace">覆盖已存在</Radio.Button>
            </Radio.Group>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                已过账的单据不会被覆盖
              </Text>
            </div>
          </Col>
          <Col xs={12} md={5}>
            <div className="field-label">含草稿表</div>
            <Switch checked={includeDrafts} onChange={setIncludeDrafts} />
          </Col>
          <Col xs={12} md={5}>
            <div className="field-label">存货自动建档</div>
            <Switch checked={autoCreateItems} onChange={setAutoCreateItems} />
          </Col>
          <Col xs={12} md={6}>
            <div className="field-label">往来单位自动建档</div>
            <Switch checked={autoCreatePartners} onChange={setAutoCreatePartners} />
          </Col>
        </Row>

        <Divider style={{ margin: '16px 0 12px' }} />
        <Space wrap>
          <Button
            icon={<FileSearchOutlined />}
            onClick={onPreview}
            loading={busy === 'preview'}
            block={isMobile}
          >
            预览（不写库）
          </Button>
          <Button
            type="primary"
            danger
            icon={<ImportOutlined />}
            onClick={onExecute}
            loading={busy === 'execute'}
            block={isMobile}
          >
            执行导入
          </Button>
        </Space>
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            建议先预览确认「会新建哪些档案、跳过哪些单据」，再执行写入。历史单据只导入不冲库存。
          </Text>
        </div>
      </Card>

      {preview && (
        <Card size="small" title="预览结果">
          <Row gutter={[8, 8]}>
            <Col xs={12} sm={8} md={4}>
              <Statistic title="单据总数" value={preview.docsTotal} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic title="将新建" value={preview.docsNew} valueStyle={{ color: '#3f8600' }} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic title="已存在跳过" value={preview.docsSkipExisting} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic title="解析失败" value={preview.docsSkipError} valueStyle={{ color: '#cf1322' }} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic title="明细行" value={preview.linesTotal} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic title="草稿" value={preview.draftsTotal} />
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0 8px' }} />
          {tagList('物料已匹配', preview.itemsMatched, 'green')}
          {tagList('物料将自动建档', preview.itemsToCreate, 'orange')}
          {tagList('往来单位已匹配', preview.partnersMatched, 'green')}
          {tagList('往来单位将自动建档', preview.partnersToCreate, 'orange')}
          {tagList('仓库', preview.warehousesMatched, 'blue')}
          {tagList('仓库缺失（会用默认仓）', preview.warehousesMissing, 'red')}
          {tagList('单据类型已匹配', preview.docTypesMatched, 'green')}
          {tagList('单据类型将自动建档', preview.docTypesToCreate, 'orange')}

          {preview.errors.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 8 }}
              message={`有 ${preview.errors.length} 条解析告警（对应单据会被跳过）`}
              description={
                <Space direction="vertical" size={2}>
                  {preview.errors.slice(0, 10).map((e, i) => (
                    <Text key={i} style={{ fontSize: 12 }}>
                      第 {e.index + 1} 行 {e.docNo || '(无单号)'}：{e.message}
                    </Text>
                  ))}
                </Space>
              }
            />
          )}

          {preview.samples.length > 0 && (
            <>
              <Title level={5} style={{ marginTop: 16 }}>
                单据样例（最多 20 张）
              </Title>
              <Table<ImportSample>
                rowKey={r => `${r.docNo}-${r.action}`}
                size="small"
                columns={sampleColumns}
                dataSource={preview.samples}
                pagination={false}
                scroll={{ x: 830 }}
              />
            </>
          )}
        </Card>
      )}

      {result && (
        <Card size="small" title="导入结果">
          <Alert
            type={result.failed ? 'warning' : 'success'}
            showIcon
            message={`新建 ${result.created} 张 · 覆盖 ${result.replaced} 张 · 跳过 ${result.skipped} 张 · 失败 ${result.failed} 张 · 明细 ${result.lines} 行`}
          />
          {(result.createdItems.length > 0 ||
            result.createdPartners.length > 0 ||
            result.createdDocTypes.length > 0) && (
            <Descriptions column={1} size="small" style={{ marginTop: 12 }} bordered>
              {result.createdItems.length > 0 && (
                <Descriptions.Item label="自动建档物料">
                  <Space wrap>
                    {result.createdItems.map(v => (
                      <Tag color="orange" key={v}>
                        {v}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
              {result.createdPartners.length > 0 && (
                <Descriptions.Item label="自动建档往来单位">
                  <Space wrap>
                    {result.createdPartners.map(v => (
                      <Tag color="orange" key={v}>
                        {v}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
              {result.createdDocTypes.length > 0 && (
                <Descriptions.Item label="自动建档单据类型">
                  <Space wrap>
                    {result.createdDocTypes.map(v => (
                      <Tag color="orange" key={v}>
                        {v}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>
          )}
          {result.errors.length > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 12 }}
              message={`${result.errors.length} 张单据导入失败`}
              description={
                <Space direction="vertical" size={2}>
                  {result.errors.slice(0, 20).map((e, i) => (
                    <Text key={i} style={{ fontSize: 12 }}>
                      {e.docNo}：{e.message}
                    </Text>
                  ))}
                </Space>
              }
            />
          )}
        </Card>
      )}
    </Space>
  );
}

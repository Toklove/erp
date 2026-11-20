import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Modal, Space, Spin, Typography, message } from 'antd';
import {
  CheckCircleOutlined,
  CopyOutlined,
  DisconnectOutlined,
  ReloadOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import { wxBindCode, wxStatus, wxUnbind, type WxBindCode, type WxBindStatus } from '../api/auth';

interface Props {
  open: boolean;
  onClose: () => void;
}

function fmtSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success('已复制');
  } catch {
    // 非 https / 旧浏览器没有 clipboard API，退化成选中
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
    message.success('已复制');
  }
}

/**
 * 后台「绑定微信」弹窗：
 * 网页端只负责生成 6 位一次性绑定码，真正发起绑定的是小程序端（它才有 openid）。
 *
 * 流程：网页生成码 → 小程序「微信一键登录」→ 未绑定 → 输入码 → 绑定并登录。
 */
export default function WxBindModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<WxBindStatus | null>(null);
  const [code, setCode] = useState<WxBindCode | null>(null);
  const [remain, setRemain] = useState(0);
  const [error, setError] = useState('');
  const [unbinding, setUnbinding] = useState(false);

  const loadStatus = useCallback(async () => {
    setError('');
    try {
      const s = await wxStatus();
      setStatus(s);
      if (s.bound) setCode(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setCode(null);
    setRemain(0);
    loadStatus().finally(() => setLoading(false));
  }, [open, loadStatus]);

  // 绑定码倒计时
  useEffect(() => {
    if (!code) return;
    const total = Math.max(0, Math.floor((new Date(code.expireAt.replace(' ', 'T')).getTime() - Date.now()) / 1000));
    setRemain(total);
    const timer = setInterval(() => {
      setRemain((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [code]);

  // 生成码后每 5 秒查一次状态：小程序绑好之后网页端能自动变成「已绑定」
  useEffect(() => {
    if (!open || !code || status?.bound) return;
    const timer = setInterval(() => {
      wxStatus()
        .then((s) => {
          if (s.bound) {
            setStatus(s);
            setCode(null);
            message.success('微信绑定成功');
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [open, code, status?.bound]);

  const onCreateCode = async () => {
    setLoading(true);
    setError('');
    try {
      const c = await wxBindCode();
      setCode(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onUnbind = () => {
    Modal.confirm({
      title: '解绑微信',
      content: '解绑后该微信将无法在小程序端一键登录，需要重新绑定。确定继续？',
      okText: '解绑',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setUnbinding(true);
        try {
          await wxUnbind();
          message.success('已解绑');
          setCode(null);
          await loadStatus();
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setUnbinding(false);
        }
      },
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      title={
        <Space size={8}>
          <WechatOutlined style={{ color: '#07c160' }} />
          微信绑定
        </Space>
      }
    >
      <Spin spinning={loading}>
        {error ? (
          <Alert
            type="error"
            showIcon
            message="操作失败"
            description={error}
            style={{ marginBottom: 12 }}
            action={
              <Button size="small" onClick={loadStatus}>
                重试
              </Button>
            }
          />
        ) : null}

        {status?.bound ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message="已绑定微信，可直接在小程序端一键登录"
              description={
                <span>
                  微信：{status.nickname || '微信用户'}
                  {status.boundAt ? ` · 绑定于 ${status.boundAt}` : ''}
                </span>
              }
            />
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                换微信需要先解绑，再用新微信重新绑定。
              </Typography.Text>
              <Button
                danger
                icon={<DisconnectOutlined />}
                loading={unbinding}
                onClick={onUnbind}
                block
              >
                解绑微信
              </Button>
            </Space>
          </Space>
        ) : (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {status && !status.configured ? (
              <Alert
                type="warning"
                showIcon
                message="服务端未配置 WX_APPID / WX_SECRET"
                description="云托管内网调用（wx.cloud.callContainer）可以靠平台注入的 X-WX-OPENID 一键登录；若小程序直连后端，需要补齐这两个环境变量。"
              />
            ) : null}

            <Typography.Text type="secondary">
              1. 点击下面的「生成绑定码」并记下 6 位码（{status ? '有效期内' : ''}可用一次）
              <br />
              2. 打开「仓库 ERP」小程序，在登录页点「微信一键登录」
              <br />
              3. 输入绑定码，点「绑定并登录」，之后就能一键登录了
            </Typography.Text>

            {code ? (
              <div className="wx-bind-code-box">
                <div className="wx-bind-code">{code.code}</div>
                <Space size={8} wrap>
                  <Typography.Text type={remain > 0 ? 'secondary' : 'danger'}>
                    {remain > 0 ? `剩余 ${fmtSeconds(remain)}` : '已过期，请重新生成'}
                  </Typography.Text>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(code.code)}
                  >
                    复制
                  </Button>
                  <Button size="small" icon={<ReloadOutlined />} onClick={onCreateCode}>
                    重新生成
                  </Button>
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  页面会自动检测绑定结果，小程序绑定成功后这里会变成「已绑定」。
                </Typography.Text>
              </div>
            ) : (
              <Button type="primary" block loading={loading} onClick={onCreateCode}>
                生成绑定码
              </Button>
            )}
          </Space>
        )}
      </Spin>
    </Modal>
  );
}
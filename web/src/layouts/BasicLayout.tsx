import { useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  Layout,
  Menu,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  CloudUploadOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth, getUser } from '../api/client';
import { useIsMobile } from '../hooks/useIsMobile';

const { Header, Sider, Content } = Layout;

/** 路径 → 页面标题 */
function titleOf(pathname: string): string {
  if (pathname.startsWith('/doc/edit')) return '编辑单据';
  if (pathname.startsWith('/doc/view')) return '单据详情';
  if (pathname.startsWith('/doc')) return '业务单据';
  if (pathname.startsWith('/md/items')) return '物料档案';
  if (pathname.startsWith('/import')) return '管家婆导入';
  return '仓库 ERP';
}

/** 路径 → 侧边栏高亮项 */
function menuKeyOf(pathname: string): string {
  if (pathname.startsWith('/doc')) return '/doc';
  if (pathname.startsWith('/md/items')) return '/md/items';
  if (pathname.startsWith('/import')) return '/import';
  return '/doc';
}

// 即时库存页已按需求移除；后端 /api/stock/balance 仍保留，需要时再做报表
const MENU_ITEMS = [
  { key: '/doc', icon: <FileTextOutlined />, label: '业务单据' },
  { key: '/md/items', icon: <AppstoreOutlined />, label: '物料档案' },
  { key: '/import', icon: <CloudUploadOutlined />, label: '管家婆导入' },
];

export default function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = getUser<{ username: string; realName?: string }>();

  const items = useMemo(() => MENU_ITEMS, []);

  const onLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  const onMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[menuKeyOf(location.pathname)]}
      items={items}
      onClick={onMenuClick}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          width={220}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          closable={false}
          styles={{ body: { padding: 0, background: '#001529' }, header: { display: 'none' } }}
        >
          <div className="app-brand">仓库 ERP</div>
          {menu}
        </Drawer>
      ) : (
        <Sider theme="dark" width={200}>
          <div className="app-brand">仓库 ERP</div>
          {menu}
        </Sider>
      )}

      <Layout>
        <Header className="app-header">
          <Space size={8}>
            {isMobile && (
              <Button
                type="text"
                aria-label="打开菜单"
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
              />
            )}
            <Tag icon={<UserOutlined />}>{user?.realName || user?.username || '未登录'}</Tag>
            <Button type="text" icon={<LogoutOutlined />} onClick={onLogout}>
              {isMobile ? '' : '退出'}
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Typography.Title level={isMobile ? 5 : 4} style={{ marginTop: 0 }}>
            {titleOf(location.pathname)}
          </Typography.Title>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

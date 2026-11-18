import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { getToken } from './api/client';
import BasicLayout from './layouts/BasicLayout';
import LoginPage from './pages/LoginPage';
import ItemListPage from './pages/ItemListPage';
import ImportPage from './pages/ImportPage';
import DocListPage from './pages/DocListPage';
import DocEditPage from './pages/DocEditPage';
import DocViewPage from './pages/DocViewPage';
import DocPrintPage from './pages/DocPrintPage';

function RequireAuth() {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <BasicLayout />;
}

/** 打印页要独占整页，不能套侧边栏，所以单独包一层只做鉴权 */
function RequireAuthPlain() {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuthPlain />}>
        <Route path="/doc/print/:id" element={<DocPrintPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/doc" replace />} />
        <Route path="/doc" element={<DocListPage />} />
        <Route path="/doc/edit/:id?" element={<DocEditPage />} />
        <Route path="/doc/view/:id" element={<DocViewPage />} />
        <Route path="/md/items" element={<ItemListPage />} />
        {/* 即时库存页已按需求移除，后端接口 /api/stock/balance 保留 */}
        <Route path="/import" element={<ImportPage />} />
        <Route path="*" element={<Navigate to="/doc" replace />} />
      </Route>
    </Routes>
  );
}

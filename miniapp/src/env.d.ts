/// <reference types="vite/client" />
/// <reference types="@dcloudio/types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** 后端地址，默认见 src/api/client.ts；设置后覆盖默认值 */
  readonly VITE_API_BASE?: string;
  /** 微信云托管环境 ID（形如 prod-1a2b3c）；为空则用 uni.request 直连 */
  readonly VITE_CLOUD_ENV?: string;
  /** 云托管服务名，默认 erp */
  readonly VITE_CLOUD_SERVICE?: string;
}

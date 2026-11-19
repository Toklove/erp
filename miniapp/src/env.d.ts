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
}

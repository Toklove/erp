import { MidwayConfig } from '@midwayjs/core';

export default {
  // 本地开发可覆盖，生产用环境变量
  typeorm: {
    dataSource: {
      default: {
        logging: true,
      },
    },
  },
} as Partial<MidwayConfig>;

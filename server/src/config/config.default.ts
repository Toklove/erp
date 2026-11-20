import { MidwayConfig } from '@midwayjs/core';
import joi from '@midwayjs/validation-joi';
import { MdItem, MdPartner, MdUnit, MdWarehouse } from '../entity/md.entity';
import { BizDoc, BizDocLine, SysDocType } from '../entity/biz.entity';
import { StkBalance, StkLedger } from '../entity/stk.entity';
import { SysDocSeq, SysUser, SysWxBindCode } from '../entity/sys.entity';

/**
 * 显式注册实体，不用路径通配符。
 *
 * 原因：用 `__dirname + 通配符` 的方式，在 dev（mwtsc 编译到临时目录）和 prod（dist）下
 * __dirname 不一致，通配符可能匹配不到任何文件，症状就是运行时
 * `No metadata for "SysUser" was found.`
 * 显式导入一次，两种模式都稳，漏加实体时 tsc 也能提前报错。
 */
const ENTITIES = [
  MdUnit,
  MdWarehouse,
  MdPartner,
  MdItem,
  BizDoc,
  BizDocLine,
  SysDocType,
  SysDocSeq,
  StkLedger,
  StkBalance,
  SysUser,
  SysWxBindCode,
];

/**
 * 数据库连接参数。
 *
 * 微信云托管会在容器里注入 `MYSQL_ADDRESS`（形如 `10.0.0.12:3306`）、
 * `MYSQL_USERNAME`、`MYSQL_PASSWORD`，这里优先读它们，
 * 自建 docker compose / 本机开发则继续用 DB_HOST / DB_PORT / DB_USER / DB_PASS。
 */
function resolveDb() {
  const address = (process.env.MYSQL_ADDRESS || '').trim();
  let host = process.env.DB_HOST || '127.0.0.1';
  let port = Number(process.env.DB_PORT || 3306);
  if (address) {
    const idx = address.lastIndexOf(':');
    if (idx > 0) {
      host = address.slice(0, idx);
      const p = Number(address.slice(idx + 1));
      if (p > 0) port = p;
    } else {
      host = address;
    }
  }
  return {
    host,
    port,
    username: process.env.MYSQL_USERNAME || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASS || '123456',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'erp',
  };
}

const db = resolveDb();

export default {
  // cookie 签名密钥，上线前务必替换
  keys: process.env.APP_KEYS || 'erp-dev-keys-change-me',

  koa: {
    // 微信云托管默认注入 PORT=80；本机 / compose 默认 7001
    port: Number(process.env.PORT || 7001),
  },

  validation: {
    validators: {
      joi,
    },
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'erp-jwt-secret-change-me',
    sign: {
      expiresIn: '7d',
    },
  },

  typeorm: {
    dataSource: {
      default: {
        type: 'mysql',
        host: db.host,
        port: db.port,
        username: db.username,
        password: db.password,
        database: db.database,
        // 表结构由 db/schema.sql 管理，禁止自动同步
        synchronize: false,
        logging: process.env.DB_LOGGING === '1',
        entities: ENTITIES,
        timezone: '+08:00',
        charset: 'utf8mb4',
        extra: {
          // DECIMAL 一律以字符串返回，交给 decimal.js 处理，避免浮点误差
          decimalNumbers: false,
          connectionLimit: Number(process.env.DB_POOL || 10),
          // 云托管缩容到 0 再拉起时，旧连接可能已被服务端断开，交给驱动自动重连
          enableKeepAlive: true,
        },
      },
    },
  },

  /** 微信小程序登录 */
  wx: {
    appid: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
    /** 绑定码有效期（分钟） */
    bindTtlMinutes: Number(process.env.WX_BIND_TTL_MIN || 10),
  },

  /** 同源部署时由后端直接托管 web 构建产物；纯 API 模式可设 STATIC_DISABLE=1 */
  staticSite: {
    dir: process.env.WEB_DIST || '',
    disabled: process.env.STATIC_DISABLE === '1',
  },

  /** 允许跨域的来源，逗号分隔；* 表示全部（小程序真机 wx.request 不受 CORS 限制，主要给 H5 用） */
  cors: {
    origins: process.env.CORS_ORIGINS || '',
  },
} as MidwayConfig;


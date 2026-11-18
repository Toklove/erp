import { MidwayConfig } from '@midwayjs/core';
import joi from '@midwayjs/validation-joi';
import { MdItem, MdPartner, MdUnit, MdWarehouse } from '../entity/md.entity';
import { BizDoc, BizDocLine, SysDocType } from '../entity/biz.entity';
import { StkBalance, StkLedger } from '../entity/stk.entity';
import { SysDocSeq, SysUser } from '../entity/sys.entity';

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
];

const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbPort = Number(process.env.DB_PORT || 3306);
const dbUser = process.env.DB_USER || 'root';
const dbPass = process.env.DB_PASS || '123456';
const dbName = process.env.DB_NAME || 'erp';

export default {
  // cookie 签名密钥，上线前务必替换
  keys: process.env.APP_KEYS || 'erp-dev-keys-change-me',

  koa: {
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
        host: dbHost,
        port: dbPort,
        username: dbUser,
        password: dbPass,
        database: dbName,
        // 表结构由 db/schema.sql 管理，禁止自动同步
        synchronize: false,
        logging: process.env.DB_LOGGING === '1',
        entities: ENTITIES,
        timezone: '+08:00',
        charset: 'utf8mb4',
        extra: {
          // DECIMAL 一律以字符串返回，交给 decimal.js 处理，避免浮点误差
          decimalNumbers: false,
          connectionLimit: 10,
        },
      },
    },
  },
} as MidwayConfig;


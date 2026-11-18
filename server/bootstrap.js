const { Bootstrap } = require('@midwayjs/bootstrap');

/**
 * 说明：@midwayjs/bootstrap 4.2.x 默认会把 `@midwayjs/logger`（当前发布版 4.1.x，旧架构）
 * 注入成 loggerFactory，而 @midwayjs/core 4.2 的日志服务需要新架构的工厂，
 * 两者混用会导致框架启动时报 "Cannot read properties of undefined (reading 'debug')"。
 *
 * 这里显式置空，让 core 使用内置的 DefaultConsoleLoggerFactory（日志输出到控制台）。
 * 等 @midwayjs/logger 发布与 core 4.2 匹配的版本后，删掉 configure 即可恢复文件日志。
 */
Bootstrap.configure({ loggerFactory: undefined }).run();

-- ============================================================
-- 05 微信登录：用户绑定字段 + 绑定码表
--
-- 可重复执行（幂等）：已存在的列 / 索引 / 表都会跳过，
-- 因此既能用于全新库（接在 01-schema.sql 之后），也能直接对老库升级。
--
-- 用法：
--   mysql -h<host> -u<user> -p <db> < docker/mysql/05-wx-login.sql
--   微信云托管「数据库」控制台 → SQL 执行 里粘贴本文件内容执行
-- ============================================================

-- ---------- sys_user：微信绑定信息 ----------
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN wx_openid VARCHAR(64) NULL DEFAULT NULL COMMENT ''微信 openid（唯一，未绑定为 NULL）''',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'wx_openid'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN wx_unionid VARCHAR(64) NOT NULL DEFAULT '''' COMMENT ''微信 unionid''',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'wx_unionid'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN wx_nickname VARCHAR(64) NOT NULL DEFAULT '''' COMMENT ''微信昵称''',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'wx_nickname'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN wx_bound_at DATETIME NULL COMMENT ''绑定微信时间''',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'wx_bound_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- openid 唯一：MySQL 的唯一索引允许多个 NULL，所以未绑定的用户不冲突
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_user ADD UNIQUE KEY uk_wx_openid (wx_openid)',
    'DO 0'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND INDEX_NAME = 'uk_wx_openid'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- sys_wx_bind_code：一次性绑定码 ----------
CREATE TABLE IF NOT EXISTS sys_wx_bind_code (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        CHAR(6)     NOT NULL COMMENT '6 位绑定码（大写，去易混字符）',
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '绑定到哪个系统用户',
  status      TINYINT     NOT NULL DEFAULT 0 COMMENT '0待用 1已使用 2已作废',
  expire_at   DATETIME    NOT NULL,
  used_at     DATETIME    NULL,
  used_openid VARCHAR(64) NOT NULL DEFAULT '',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信绑定码（一次性，10 分钟有效）';
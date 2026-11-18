-- ============================================================
-- 初始化基础数据（幂等，可重复执行）
-- 默认账号：admin / admin123  ← 上线前必须改掉
-- 密码算法：scrypt（Node 内置 crypto），哈希格式 scrypt:salt:hash
-- ============================================================

USE erp;

INSERT INTO md_unit (code, name, decimals, sort, status)
VALUES
  ('PCS', '个', 0, 1, 1),
  ('BOX', '箱', 0, 2, 1),
  ('KG', '千克', 3, 3, 1),
  ('M', '米', 2, 4, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO md_warehouse (code, name, allow_negative, use_location, sort, status)
VALUES
  ('WH01', '主仓', 0, 0, 1, 1),
  ('WH02', '次品仓', 0, 0, 2, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO md_category (parent_id, code, name, path, sort, status)
VALUES (0, 'C001', '默认分类', '/C001/', 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO sys_user (username, password_hash, real_name, status)
VALUES (
  'admin',
  'scrypt:0eb54cccff0307f8307643c286ccd729:4bd616cb7f62382610ac6e3e7ecd13a0da80a369494010bda3b719a1f35eac4c',
  '系统管理员',
  1
)
ON DUPLICATE KEY UPDATE real_name = VALUES(real_name);

INSERT INTO sys_role (code, name, remark)
VALUES ('admin', '超级管理员', '拥有全部权限')
ON DUPLICATE KEY UPDATE name = VALUES(name);

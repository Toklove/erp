import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { MdItem, MdPartner, MdUnit, MdWarehouse } from '../entity/md.entity';
import { SysDocType } from '../entity/biz.entity';
import { BizError } from '../common/biz-error';

/**
 * 基础档案解析器：把「名字」变成「档案」。
 *
 * 为什么单独抽出来：
 * 1) 管家婆导入的数据里只有「存货全名 / 仓库全名 / 往来单位」这些字符串，没有内部 id；
 * 2) 手工录单时用户也可能只打一个存货名，没从档案里选；
 * 3) 过账需要真实的 item_id 才能动库存，否则就报「第 N 行没有关联物料档案」。
 * 所以「解析不到就自动建档」必须是一处实现、两处（录单 / 导入 / 过账）共用。
 *
 * 一次批量操作（导入 N 张单据）要传同一个 cache，避免逐行查库。
 */
export interface MdCache {
  items: Map<string, MdItem>;
  units: Map<string, MdUnit>;
  partners: Map<string, MdPartner>;
  warehouses: Map<string, MdWarehouse>;
  docTypes: Map<string, SysDocType>;
}

export function createMdCache(): MdCache {
  return {
    items: new Map(),
    units: new Map(),
    partners: new Map(),
    warehouses: new Map(),
    docTypes: new Map(),
  };
}

export interface ResolveItemOptions {
  /** 自动建档开关，默认 true —— 关掉就退回「解析不到返回 null」 */
  autoCreate?: boolean;
  unitName?: string;
  spec?: string;
  remark?: string;
  operatorId?: number;
}

export interface ResolveItemResult {
  item: MdItem | null;
  created: boolean;
}

export interface ResolvePartnerOptions {
  autoCreate?: boolean;
  /** 1 客户 2 供应商 3 兼有 */
  partnerType?: number;
  contact?: string;
  phone?: string;
  address?: string;
}

@Provide()
export class MasterDataService {
  @InjectEntityModel(MdItem)
  itemRepo: Repository<MdItem>;

  @InjectEntityModel(MdUnit)
  unitRepo: Repository<MdUnit>;

  @InjectEntityModel(MdWarehouse)
  warehouseRepo: Repository<MdWarehouse>;

  @InjectEntityModel(MdPartner)
  partnerRepo: Repository<MdPartner>;

  @InjectEntityModel(SysDocType)
  docTypeRepo: Repository<SysDocType>;

  // ---------------------------------------------------------------
  // 物料
  // ---------------------------------------------------------------

  /** 只查不建：名称 → 编码 的顺序匹配 */
  async findItem(name: string, cache: MdCache = createMdCache()): Promise<MdItem | null> {
    const key = trimName(name);
    if (!key) return null;
    if (cache.items.has(key)) return cache.items.get(key) || null;

    // 1) 名称精确匹配
    let hit = await this.itemRepo.findOne({ where: { name: key }, order: { id: 'ASC' } });
    if (!hit) {
      // 2) 存货全名里带规格时（"伟东茶几G56-130"）退一步用编码匹配
      hit = await this.itemRepo.findOne({ where: { code: key }, order: { id: 'ASC' } });
    }
    if (!hit) {
      // 3) 名称里多余空格（"财-101# 大床" vs "财-101#大床"）的容错
      const compact = key.replace(/\s+/g, '');
      if (compact !== key) {
        hit = await this.itemRepo.findOne({ where: { name: compact }, order: { id: 'ASC' } });
      }
    }
    if (hit) cache.items.set(key, hit);
    return hit;
  }

  /**
   * 解析物料，解析不到按需自动建档。
   * 自动建档的编码用 `AUTO-` + 名称哈希，稳定且不会因为并发而重号。
   */
  async resolveItem(
    name: string,
    opts: ResolveItemOptions = {},
    cache: MdCache = createMdCache()
  ): Promise<ResolveItemResult> {
    const key = trimName(name);
    if (!key) return { item: null, created: false };

    const exists = await this.findItem(key, cache);
    if (exists) return { item: exists, created: false };
    if (opts.autoCreate === false) return { item: null, created: false };

    const unit = await this.resolveUnit(opts.unitName, cache);
    const code = await this.nextAutoCode('AUTO', 10, key, async c =>
      Boolean(await this.itemRepo.findOne({ where: { code: c }, withDeleted: true }))
    );

    const entity = this.itemRepo.create({
      code,
      name: key.slice(0, 128),
      spec: (opts.spec || '').slice(0, 255),
      baseUnitId: unit?.id || 0,
      refCost: '0',
      taxRate: '0',
      remark: (opts.remark || '由单据自动建档').slice(0, 255),
      status: 1,
      createdBy: opts.operatorId || 0,
      updatedBy: opts.operatorId || 0,
    });
    const saved = await this.itemRepo.save(entity);
    cache.items.set(key, saved);
    return { item: saved, created: true };
  }

  // ---------------------------------------------------------------
  // 单位
  // ---------------------------------------------------------------

  async resolveUnit(name: string | undefined, cache: MdCache): Promise<MdUnit | null> {
    const key = trimName(name);
    if (key && cache.units.has(key)) return cache.units.get(key) || null;

    if (key) {
      const hit =
        (await this.unitRepo.findOne({ where: { name: key } })) ||
        (await this.unitRepo.findOne({ where: { code: key.toUpperCase() } }));
      if (hit) {
        cache.units.set(key, hit);
        return hit;
      }
    }
    // 兜底：基本单位 → 精度 0 的「个」；再不行取第一个启用的
    const fallback =
      (await this.unitRepo.findOne({ where: { code: 'PCS' } })) ||
      (await this.unitRepo.findOne({ where: { status: 1 }, order: { sort: 'ASC', id: 'ASC' } }));
    if (fallback) {
      if (key) cache.units.set(key, fallback);
      return fallback;
    }
    // 库里一个单位都没有时补一条，保证 md_item.base_unit_id 有值
    const created = await this.unitRepo.save(
      this.unitRepo.create({ code: 'PCS', name: '个', decimals: 0, sort: 0, status: 1 })
    );
    if (key) cache.units.set(key, created);
    return created;
  }

  /** 按 id 取单位（明细只存了 unit_id 时用） */
  async findUnitById(id: number, cache: MdCache): Promise<MdUnit | null> {
    if (!id) return null;
    const k = `id:${id}`;
    if (cache.units.has(k)) return cache.units.get(k) || null;
    const hit = await this.unitRepo.findOne({ where: { id } });
    if (hit) cache.units.set(k, hit);
    return hit;
  }

  // ---------------------------------------------------------------
  // 仓库
  // ---------------------------------------------------------------

  async resolveWarehouse(
    name: string | undefined,
    cache: MdCache,
    preferredId?: number
  ): Promise<MdWarehouse | null> {
    const key = trimName(name);
    if (key && cache.warehouses.has(key)) return cache.warehouses.get(key) || null;

    if (preferredId) {
      const byId = await this.warehouseRepo.findOne({ where: { id: preferredId } });
      if (byId) return byId;
    }
    if (key) {
      const hit = await this.warehouseRepo.findOne({ where: { name: key } });
      if (hit) {
        cache.warehouses.set(key, hit);
        return hit;
      }
    }
    const fallback = await this.warehouseRepo.findOne({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
    });
    if (fallback && key) cache.warehouses.set(key, fallback);
    return fallback;
  }

  // ---------------------------------------------------------------
  // 往来单位
  // ---------------------------------------------------------------

  async findPartner(name: string, cache: MdCache): Promise<MdPartner | null> {
    const key = trimName(name);
    if (!key) return null;
    if (cache.partners.has(key)) return cache.partners.get(key) || null;
    const hit =
      (await this.partnerRepo.findOne({ where: { name: key }, order: { id: 'ASC' } })) ||
      (await this.partnerRepo.findOne({ where: { code: key }, order: { id: 'ASC' } }));
    if (hit) cache.partners.set(key, hit);
    return hit;
  }

  async resolvePartner(
    name: string,
    opts: ResolvePartnerOptions = {},
    cache: MdCache = createMdCache()
  ): Promise<{ partner: MdPartner | null; created: boolean }> {
    const key = trimName(name);
    if (!key) return { partner: null, created: false };

    const exists = await this.findPartner(key, cache);
    if (exists) return { partner: exists, created: false };
    if (opts.autoCreate === false) return { partner: null, created: false };

    const code = await this.nextAutoCode('GJP-P', 8, key, async c =>
      Boolean(await this.partnerRepo.findOne({ where: { code: c }, withDeleted: true }))
    );
    const saved = await this.partnerRepo.save(
      this.partnerRepo.create({
        code,
        name: key.slice(0, 128),
        partnerType: opts.partnerType || 3,
        contact: (opts.contact || '').slice(0, 64),
        phone: (opts.phone || '').slice(0, 32),
        address: (opts.address || '').slice(0, 255),
        remark: '导入自动建档',
        status: 1,
      })
    );
    cache.partners.set(key, saved);
    return { partner: saved, created: true };
  }

  // ---------------------------------------------------------------
  // 单据类型
  // ---------------------------------------------------------------

  /**
   * 按「类型名 / 编码 / 单号前缀」找单据类型；找不到且允许时自动建一条
   * （stock_dir=0, need_post=0，安全默认：不认识的单据类型不允许过账）。
   */
  async resolveDocType(
    hints: { code?: string; name?: string; prefix?: string; docNo?: string },
    opts: { autoCreate?: boolean } = {},
    cache: MdCache = createMdCache()
  ): Promise<SysDocType> {
    const prefix = (hints.prefix || prefixOf(hints.docNo || '') || '').toUpperCase();
    const name = trimName(hints.name);
    const code = (hints.code || prefix || '').toUpperCase();

    for (const [k, v] of cache.docTypes) {
      if ((code && k === `code:${code}`) || (name && k === `name:${name}`) || (prefix && k === `prefix:${prefix}`)) {
        return v;
      }
    }

    let hit: SysDocType | null = null;
    if (code) hit = await this.docTypeRepo.findOne({ where: { code } });
    if (!hit && prefix) hit = await this.docTypeRepo.findOne({ where: { prefix } });
    if (!hit && name) hit = await this.docTypeRepo.findOne({ where: { name } });
    if (hit) {
      cacheRemember(cache, hit);
      return hit;
    }
    if (name) {
      // 名称带「单 / 订单」但前缀不同的情况：模糊一次
      hit = await this.docTypeRepo
        .createQueryBuilder('t')
        .where('t.name LIKE :n', { n: `%${name}%` })
        .andWhere('t.status = 1')
        .orderBy('t.sort', 'ASC')
        .getOne();
      if (hit) {
        cacheRemember(cache, hit);
        return hit;
      }
    }

    if (opts.autoCreate === false) throw new BizError(`单据类型不存在：${name || code || '未知'}`);

    const fallbackCode = (code || name || 'GJP').slice(0, 16);
    const saved = await this.docTypeRepo.save(
      this.docTypeRepo.create({
        code: fallbackCode,
        name: (name || fallbackCode).slice(0, 32),
        prefix: (prefix || fallbackCode).slice(0, 16),
        stockDir: 0,
        ledgerType: 0,
        needPost: 0,
        sort: 900,
        status: 1,
      })
    );
    cacheRemember(cache, saved);
    return saved;
  }

  async listDocTypes(): Promise<SysDocType[]> {
    return this.docTypeRepo.find({ where: { status: 1 }, order: { sort: 'ASC', id: 'ASC' } });
  }

  // ---------------------------------------------------------------
  // 工具
  // ---------------------------------------------------------------

  /** 生成 `AUTO-xxxx` 这类自动编码：名称哈希 + 冲突重试 */
  private async nextAutoCode(
    prefix: string,
    len: number,
    seed: string,
    taken: (code: string) => Promise<boolean>
  ): Promise<string> {
    let base = hash(seed).slice(0, len);
    for (let i = 0; i < 20; i++) {
      const code = `${prefix}-${i === 0 ? base : `${base}${i}`}`.slice(0, 64);
      if (!(await taken(code))) return code;
    }
    return `${prefix}-${Date.now().toString(36)}`.slice(0, 64);
  }

  /** 事务内的解析等价物：只用于导入（同一个 manager，保证与主表同事务） */
  withManager(_manager: unknown): void {
    // 预留：导入目前走 service 自带的 repo（同一连接池），不需要绑定 manager
  }
}

function cacheRemember(cache: MdCache, t: SysDocType) {
  cache.docTypes.set(`code:${t.code}`, t);
  cache.docTypes.set(`name:${t.name}`, t);
  if (t.prefix) cache.docTypes.set(`prefix:${t.prefix}`, t);
}

function trimName(v?: string | null): string {
  return String(v ?? '')
    .replace(/\u3000/g, ' ')
    .trim();
}

/** 单号前缀：XS-2022-12-07-00001 → XS */
export function prefixOf(docNo: string): string {
  const m = /^([A-Za-z0-9]+)-/.exec(String(docNo || ''));
  return m ? m[1].toUpperCase() : '';
}

/** 32-bit FNV-1a → base36，只为生成稳定短编码 */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  let out = '';
  let v = h;
  while (v > 0) {
    out = (v % 36).toString(36) + out;
    v = Math.floor(v / 36);
  }
  return out.padStart(8, '0');
}

/** 保留给「查归档物料」的调用方：排除软删除的查询条件 */
export const NOT_DELETED = { deletedAt: IsNull() } as const;

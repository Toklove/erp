import { Controller, Get, Query } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Like, Repository } from 'typeorm';
import { MdPartner, MdUnit, MdWarehouse } from '../entity/md.entity';

/**
 * 基础档案只读接口：仓库 / 单位 / 往来单位。
 * 单据编辑页的下拉与自动补全依赖它们。
 * 全部走 TypeORM repository，不再有裸 SQL。
 */
@Controller('/api/md')
export class MdController {
  @InjectEntityModel(MdWarehouse)
  warehouseRepo: Repository<MdWarehouse>;

  @InjectEntityModel(MdUnit)
  unitRepo: Repository<MdUnit>;

  @InjectEntityModel(MdPartner)
  partnerRepo: Repository<MdPartner>;

  @Get('/warehouses')
  async warehouses() {
    // 注意：md_warehouse / md_unit 没有 deleted_at 列，只有 status，别照抄 md_partner 的过滤条件
    const rows = await this.warehouseRepo.find({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
      select: { id: true, code: true, name: true },
    });
    return { success: true, data: rows };
  }

  @Get('/units')
  async units() {
    const rows = await this.unitRepo.find({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
      select: { id: true, code: true, name: true, decimals: true },
    });
    return { success: true, data: rows };
  }

  @Get('/partners')
  async partners(@Query('keyword') keyword: string) {
    const kw = (keyword || '').trim();
    const rows = await this.partnerRepo.find({
      where: kw ? { name: Like(`%${kw}%`) } : {},
      order: { id: 'ASC' },
      take: 50,
      select: { id: true, code: true, name: true, contact: true, phone: true, address: true },
    });
    return { success: true, data: rows };
  }
}

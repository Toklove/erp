import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Like, Repository, FindOptionsWhere } from 'typeorm';
import { MdItem } from '../entity/md.entity';
import { BizError } from '../common/biz-error';

export interface ItemQuery {
  keyword?: string;
  status?: number;
  page?: number;
  pageSize?: number;
}

@Provide()
export class ItemService {
  @InjectEntityModel(MdItem)
  itemRepo: Repository<MdItem>;

  async page(query: ItemQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));

    const where: FindOptionsWhere<MdItem>[] = [];
    const kw = (query.keyword || '').trim();
    if (kw) {
      where.push({ code: Like(`%${kw}%`) }, { name: Like(`%${kw}%`) }, { barcode: Like(`%${kw}%`) });
    } else {
      where.push({});
    }

    const [rows, total] = await this.itemRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { rows, total, page, pageSize };
  }

  async create(input: Partial<MdItem>, operatorId = 0) {
    if (!input.code || !input.name) throw new BizError('编码和名称必填');
    const exists = await this.itemRepo.findOne({ where: { code: input.code }, withDeleted: true });
    if (exists) throw new BizError(`编码 ${input.code} 已存在`);

    const entity = this.itemRepo.create({
      ...input,
      createdBy: operatorId,
      updatedBy: operatorId,
    });
    return this.itemRepo.save(entity);
  }

  async update(id: number, input: Partial<MdItem>, operatorId = 0) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new BizError('物料不存在', 'NOT_FOUND', 404);
    // 编码一旦启用不允许改：历史单据、条码、对账全靠它
    delete (input as any).code;
    delete (input as any).id;
    Object.assign(item, input, { updatedBy: operatorId });
    return this.itemRepo.save(item);
  }

  async remove(id: number) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new BizError('物料不存在', 'NOT_FOUND', 404);
    await this.itemRepo.softDelete(id);
    return { id };
  }
}

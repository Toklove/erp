import { Body, Controller, Get, Inject, Param, Post, Query } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import { DocService } from '../service/doc.service';
import type { DocInput } from '../service/doc.service';
import { StockService } from '../service/stock.service';
import { currentUser } from '../middleware/auth.middleware';
import { BizError } from '../common/biz-error';

@Controller('/api/doc')
export class DocController {
  @Inject()
  docService: DocService;

  @Inject()
  stockService: StockService;

  @Inject()
  ctx: Context;

  @Get('/types')
  async types() {
    return { success: true, data: await this.docService.docTypes() };
  }

  @Get('/page')
  async page(
    @Query('keyword') keyword: string,
    @Query('docType') docType: string,
    @Query('status') status: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string
  ) {
    const data = await this.docService.page({
      keyword,
      docType,
      status: status === undefined || status === '' ? undefined : Number(status),
      dateFrom,
      dateTo,
      page: Number(page),
      pageSize: Number(pageSize),
    });
    return { success: true, data };
  }

  @Get('/detail/:id')
  async detail(@Param('id') id: string) {
    return { success: true, data: await this.docService.detail(Number(id)) };
  }

  /** 按单据编号查详情（管家婆导入靠单号对齐；页面想按单号直链也可以用它） */
  @Get('/detail-by-no/:docNo')
  async detailByNo(@Param('docNo') docNo: string) {
    return { success: true, data: await this.docService.detailByNo(docNo) };
  }

  @Post('/create')
  async create(@Body() body: DocInput) {
    const user = currentUser(this.ctx);
    const data = await this.docService.create(body, user);
    return { success: true, data, message: '创建成功' };
  }

  @Post('/update/:id')
  async update(@Param('id') id: string, @Body() body: DocInput) {
    const user = currentUser(this.ctx);
    const data = await this.docService.update(Number(id), body, user);
    return { success: true, data, message: '保存成功' };
  }

  @Post('/delete/:id')
  async remove(@Param('id') id: string) {
    return { success: true, data: await this.docService.remove(Number(id)), message: '已删除' };
  }

  @Post('/audit/:id')
  async audit(@Param('id') id: string) {
    const user = currentUser(this.ctx);
    const data = await this.docService.audit(Number(id), user);
    return {
      success: true,
      data,
      message: data.status === 1 ? '审核通过' : '已反审核',
    };
  }

  @Post('/void/:id')
  async voidDoc(@Param('id') id: string) {
    const user = currentUser(this.ctx);
    return { success: true, data: await this.docService.void(Number(id), user), message: '已作废' };
  }

  /** 过账：动库存。只有开了 need_post 的单据类型允许 */
  @Post('/post/:id')
  async post(@Param('id') id: string) {
    const user = currentUser(this.ctx);
    const detail = await this.docService.detail(Number(id));
    if (!detail.needPost) {
      throw new BizError(`「${detail.docTypeName}」不影响库存，无需过账`);
    }
    const data = await this.stockService.post(Number(id), user.uid);
    return { success: true, data, message: '过账成功' };
  }

  @Post('/printed/:id')
  async printed(@Param('id') id: string) {
    return { success: true, data: await this.docService.markPrinted(Number(id)) };
  }

  @Get('/autocomplete')
  async autocomplete(
    @Query('field') field: string,
    @Query('keyword') keyword: string,
    @Query('limit') limit: string
  ) {
    if (!field) throw new BizError('缺少 field 参数');
    return { success: true, data: await this.docService.autocomplete(field, keyword, Number(limit) || 10) };
  }

  @Get('/item-hint')
  async itemHint(@Query('name') name: string) {
    return { success: true, data: await this.docService.itemHint(name || '') };
  }
}

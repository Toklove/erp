import { Body, Controller, Get, Inject, Param, Post, Query } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import { ItemService } from '../service/item.service';
import { currentUser } from '../middleware/auth.middleware';

@Controller('/api/md/items')
export class ItemController {
  @Inject()
  itemService: ItemService;

  @Inject()
  ctx: Context;

  @Get('/page')
  async page(
    @Query('keyword') keyword: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string
  ) {
    const data = await this.itemService.page({
      keyword,
      page: Number(page),
      pageSize: Number(pageSize),
    });
    return { success: true, data };
  }

  @Post('/create')
  async create(@Body() body: any) {
    const user = currentUser(this.ctx);
    const data = await this.itemService.create(body, user.uid);
    return { success: true, data, message: '创建成功' };
  }

  @Post('/update/:id')
  async update(@Param('id') id: string, @Body() body: any) {
    const user = currentUser(this.ctx);
    const data = await this.itemService.update(Number(id), body, user.uid);
    return { success: true, data, message: '保存成功' };
  }

  @Post('/delete/:id')
  async remove(@Param('id') id: string) {
    const data = await this.itemService.remove(Number(id));
    return { success: true, data, message: '已删除' };
  }
}

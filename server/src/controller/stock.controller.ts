import { Controller, Get, Inject, Param, Post, Query } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import { StockService } from '../service/stock.service';
import { currentUser } from '../middleware/auth.middleware';

@Controller('/api/stock')
export class StockController {
  @Inject()
  stockService: StockService;

  @Inject()
  ctx: Context;

  /** 过账：M2 阶段的核心接口，先留出入口 */
  @Post('/post/:docId')
  async post(@Param('docId') docId: string) {
    const user = currentUser(this.ctx);
    const data = await this.stockService.post(Number(docId), user.uid);
    return { success: true, data, message: '过账成功' };
  }

  @Get('/balance')
  async balance(
    @Query('warehouseId') warehouseId: string,
    @Query('itemId') itemId: string,
    @Query('keyword') keyword: string
  ) {
    const data = await this.stockService.balanceList({
      warehouseId: Number(warehouseId) || 0,
      itemId: Number(itemId) || 0,
      keyword,
    });
    return { success: true, data };
  }
}

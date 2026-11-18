import { Body, Controller, Get, Inject, Post, Query } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import { ImportService, type ImportOptions } from '../service/import.service';
import { currentUser } from '../middleware/auth.middleware';
// import jsondata from '../../scripts/alldata.json';

/**
 * 管家婆数据导入接口。
 * 前端导入页用 /preview 先看会建多少档案、跳过多少单，再 /execute 落库。
 * CLI 也可以复用同一套服务（scripts/import-gjp.js）。
 */
@Controller('/api/import')
export class ImportController {
  @Inject()
  importService: ImportService;

  @Inject()
  ctx: Context;

  @Post('/preview')
  async preview(@Body() body: any, @Query('mode') mode: string) {
    const payload = unwrap(body);
    return { success: true, data: await this.importService.preview(payload, optsOf(body, mode)) };
  }

  @Post('/execute')
  async execute(@Body() body: any, @Query('mode') mode: string) {
    const user = currentUser(this.ctx);
//     console.log(body)
//     // console.log(jsondata)
//     body = {
//   payload: jsondata,
//   mode: 'skip',
//   includeDrafts: true,
//   autoCreateItems: true,
//   autoCreatePartners: true,
//   autoCreateDocTypes: true
// }
    const result = await this.importService.execute(unwrap(body), {
      ...optsOf(body, mode),
      operatorId: user.uid,
      username: user.username,
    });
    return { success: true, data: result, message: `导入完成：新建 ${result.created} 张，覆盖 ${result.replaced} 张` };
  }

  @Get('/help')
  async help() {
    return {
      success: true,
      data: {
        format: {
          单据: '表头数组（行号/日期/单据编号/单据类型/往来单位/金额/摘要/审核状态/经办人/制单人/部门/打印次数/保存时间/审核时间/修改人/修改时间）',
          单据详情: '明细数组（行号/日期/单据类型/单据编号/仓库全名/存货全名/数量/金额/单据摘要/批号/到期日期/行摘要/对方编码/对方存货名称/对方规格型号/制单人/基本单位/辅1数量/审核状态/辅2数量/含税金额/辅助数量/副单位数量）',
          草稿: '表头数组（行号/选择/日期/单据编号/单据类型/往来单位/金额/摘要/制单人/经办人/部门全名）',
        },
        options: {
          mode: 'skip（默认，按单号跳过已存在）| replace（按单号覆盖，已过账的不覆盖）',
          autoCreateItems: '解析不到物料时自动建档，默认 true',
          autoCreatePartners: '解析不到往来单位时自动建档，默认 true',
          autoCreateDocTypes: '解析不到单据类型时自动建档，默认 true',
          includeDrafts: '是否导入草稿表，默认 true',
        },
        note: '单据编号是唯一的关联键；明细表有单号但表头缺失时会用明细信息补一张表头。历史单据只导入不冲库存。',
      },
    };
  }
}

/** 允许 body 是 { payload: {...} } 或直接就是三张表 */
function unwrap(body: any): any {
  if (body && typeof body === 'object' && body.payload && typeof body.payload === 'object') {
    return body.payload;
  }
  return body;
}

function optsOf(body: any, mode?: string): ImportOptions {
  const b = (body || {}) as Record<string, any>;
  return {
    mode: (mode || b.mode) === 'replace' ? 'replace' : 'skip',
    autoCreateItems: b.autoCreateItems !== false,
    autoCreatePartners: b.autoCreatePartners !== false,
    autoCreateDocTypes: b.autoCreateDocTypes !== false,
    includeDrafts: b.includeDrafts !== false,
  };
}

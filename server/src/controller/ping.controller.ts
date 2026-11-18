import { Controller, Get } from '@midwayjs/core';

@Controller('/api')
export class PingController {
  @Get('/ping')
  async ping() {
    return { success: true, data: { pong: true, ts: Date.now() } };
  }

  @Get('/health')
  async health() {
    return { success: true, data: { status: 'UP', uptime: process.uptime() } };
  }
}

import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('documents')
  async listDocuments() {
    return this.appService.listDocuments();
  }

  @Post('documents')
  async createDocument(@Body('originalFilename') originalFilename?: string) {
    const safeFilename = originalFilename?.trim() || 'untitled.csv';
    return this.appService.createDocument(safeFilename);
  }
}

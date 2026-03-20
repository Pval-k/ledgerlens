import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post('documents/:id/process')
  async processDocument(@Param('id') id: string) {
    return this.appService.enqueueDocument(id);
  }

  @Get('documents/:id/status')
  async getDocumentStatus(@Param('id') id: string) {
    return this.appService.getDocumentStatus(id);
  }
}

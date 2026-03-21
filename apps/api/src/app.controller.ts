import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AppService } from './app.service';
import type { UploadSessionBody } from './app.service';

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

  /** Creates a document row and returns a presigned PUT URL for MinIO/S3. */
  @Post('documents/upload-session')
  async createUploadSession(@Body() body: UploadSessionBody) {
    return this.appService.createUploadSession(body);
  }

  /** After the client PUTs the object, call this to verify it exists and enqueue ingestion. */
  @Post('documents/:id/complete-upload')
  async completeUpload(@Param('id') id: string) {
    return this.appService.completeUpload(id);
  }

  @Get('documents/:id/status')
  async getDocumentStatus(@Param('id') id: string) {
    return this.appService.getDocumentStatus(id);
  }

  /** Paginated normalized transactions for a document (newest first). */
  @Get('documents/:id/transactions')
  async listTransactions(
    @Param('id') id: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const rawLimit = parseInt(limitStr ?? '50', 10) || 50;
    const limit = Math.min(100, Math.max(1, rawLimit));
    return this.appService.listTransactions(id, { page, limit });
  }
}

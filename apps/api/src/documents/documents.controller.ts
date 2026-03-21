import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { UploadSessionBody } from './documents.service';
import { DocumentsService } from './documents.service';

@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('documents')
  async listDocuments() {
    return this.documentsService.listDocuments();
  }

  /** Creates a document row and returns a presigned PUT URL for MinIO/S3. */
  @Post('documents/upload-session')
  async createUploadSession(@Body() body: UploadSessionBody) {
    return this.documentsService.createUploadSession(body);
  }

  /** After the client PUTs the object, call this to verify it exists and enqueue ingestion. */
  @Post('documents/:id/complete-upload')
  async completeUpload(@Param('id') id: string) {
    return this.documentsService.completeUpload(id);
  }

  @Get('documents/:id/status')
  async getDocumentStatus(@Param('id') id: string) {
    return this.documentsService.getDocumentStatus(id);
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
    return this.documentsService.listTransactions(id, { page, limit });
  }
}

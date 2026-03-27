import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { UploadSessionBody } from './documents.service';
import { DocumentsService } from './documents.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('documents')
  listDocuments(@CurrentUser() user: AuthUser) {
    return this.documentsService.listDocuments(user.userId);
  }

  /** Creates a document row and returns a presigned PUT URL for MinIO/S3. */
  @Post('documents/upload-session')
  async createUploadSession(
    @CurrentUser() user: AuthUser,
    @Body() body: UploadSessionBody,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.documentsService.createUploadSession(
      user.userId,
      body,
      idempotencyKey,
    );
  }

  /** After the client PUTs the object, call this to verify it exists and enqueue ingestion. */
  @Post('documents/:id/complete-upload')
  async completeUpload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.documentsService.completeUpload(user.userId, id, idempotencyKey);
  }

  @Get('documents/:id/status')
  async getDocumentStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.documentsService.getDocumentStatus(user.userId, id);
  }

  /** Presigned GET URL to open or download the original uploaded file from object storage. */
  @Get('documents/:id/download-url')
  getDocumentDownloadUrl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.documentsService.getDocumentDownloadUrl(user.userId, id);
  }

  /** Deletes the document, related DB rows (cascade), and the stored object (best-effort). */
  @Delete('documents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await this.documentsService.deleteDocument(user.userId, id);
  }

  /** Paginated normalized transactions for a document (newest first). */
  @Get('documents/:id/transactions')
  async listTransactions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const rawLimit = parseInt(limitStr ?? '50', 10) || 50;
    const limit = Math.min(100, Math.max(1, rawLimit));
    return this.documentsService.listTransactions(user.userId, id, {
      page,
      limit,
    });
  }
}

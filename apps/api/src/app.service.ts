import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async listDocuments() {
    return this.prisma.listDocuments();
  }

  async createDocument(originalFilename: string) {
    return this.prisma.createDocument(originalFilename);
  }
}

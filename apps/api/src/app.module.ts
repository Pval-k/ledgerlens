import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { QueueService } from './queue.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, PrismaService, QueueService],
})
export class AppModule {}

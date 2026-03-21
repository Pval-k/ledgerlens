import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Database access — `@Global()` so feature modules can inject `PrismaService` without re-importing. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

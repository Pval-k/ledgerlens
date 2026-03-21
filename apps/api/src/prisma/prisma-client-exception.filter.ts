import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Maps common Prisma errors to HTTP responses (e.g. missing columns after a skipped migration). */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';

    switch (exception.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'A record with this value already exists';
        break;
      case 'P2022':
        message =
          'Database schema is out of date. From apps/api run: pnpm exec prisma migrate deploy';
        break;
      default:
        if (process.env.NODE_ENV !== 'production') {
          message = exception.message;
        }
    }

    res.status(status).json({
      statusCode: status,
      message,
      code: exception.code,
    });
  }
}

import type { Server as HttpServer } from 'node:http';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { applyServerTimeouts } from './common/http/server-timeouts';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  app.enableCors({ origin: true, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tool Auto FB API')
    .setDescription('Quản lý content + Bot tự động đăng bài Facebook Page')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    `${config.apiPrefix}/docs`,
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  // Phải đặt TRƯỚC listen: upload video lớn đi qua đây, mặc định 300s là quá ngắn.
  applyServerTimeouts(app.getHttpServer() as HttpServer, {
    requestTimeoutMs: config.httpRequestTimeoutMs,
  });

  await app.listen(config.port);
  logger.log(
    `HTTP requestTimeout=${config.httpRequestTimeoutMs}ms (upload file lớn)`,
  );
  logger.log(
    `API chạy tại http://localhost:${config.port}/${config.apiPrefix}`,
  );
  logger.log(
    `Swagger tại http://localhost:${config.port}/${config.apiPrefix}/docs`,
  );
  logger.log(`Autopost: enabled=${config.autoPost.enabled}`);
}

void bootstrap();

import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SerializerInterceptor } from './utils/serializer.interceptor';
import validationOptions from './utils/validation-options';
import * as opentracing from 'opentracing';
import { initTracer } from 'jaeger-client';

const getJaegerClient = () => {
  const config = {
    serviceName: 'tech-talk-yona-jaeger',
    sampler: {
      type: 'const',
      param: 1,
    },
    reporter: {
      logSpans: false,
      collectorEndpoint: process.env.JAEGER_API,
    },
  };
  const options = {
    logger: {
      info: function logInfo(msg: string) {
        new Logger('main').log(`Jaeger: ${msg}`);
      },
      error: function logError(msg: string) {
        new Logger('main').error(`Jaeger: ${msg}`);
      },
    },
  };
  return initTracer(config, options);
};

async function bootstrap() {
  opentracing.initGlobalTracer(getJaegerClient());
  const app = await NestFactory.create(AppModule, { cors: true });
  const configService = app.get(ConfigService);

  app.enableShutdownHooks();
  app.setGlobalPrefix(configService.get('app.apiPrefix'), {
    exclude: ['/'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalInterceptors(new SerializerInterceptor());
  app.useGlobalPipes(new ValidationPipe(validationOptions));

  const options = new DocumentBuilder()
    .setTitle('API')
    .setDescription('API docs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('docs', app, document);

  await app.listen(configService.get('app.port'));
}
void bootstrap();

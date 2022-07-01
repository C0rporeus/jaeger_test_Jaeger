import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, map, Observable } from 'rxjs';
import * as opentracing from 'opentracing';

@Injectable()
export class OpentracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tracer = opentracing.globalTracer();
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const tracerContext = tracer.extract(
      opentracing.FORMAT_HTTP_HEADERS,
      req.headers,
    );
    const path = req.route?.path;
    const span = tracer.startSpan(path, {
      childOf: tracerContext,
    });
    span.log({ event: 'request_received' });
    span.setTag('http.method', req.method);
    span.setTag('span.kind', 'server');
    span.setTag('http.url', req.url);
    span.setTag('Request body', { ...req.body });

    const responseHeaders = {};
    tracer.inject(span, opentracing.FORMAT_TEXT_MAP, responseHeaders);
    Object.keys(responseHeaders).forEach((key) =>
      res.setHeader(key, responseHeaders[key]),
    );
    Object.assign(req, { span });

    return next.handle().pipe(
      map((responseBody) => {
        this.finishSpan(span, req, res, responseBody);
        return responseBody;
      }),
      catchError((error) => {
        span.setTag('error', true);
        span.setTag('sampling.priority', 1);
        this.finishSpan(span, req, res, error);
        throw error;
      }),
    );
  }

  private finishSpan(span: opentracing.Span, req, response, responseBody) {
    span.log({ event: 'response_finished' });
    span.setOperationName(req.route?.path);
    span.setTag('http.status_code', response.statusCode);
    span.setTag('response body', responseBody);
    span.finish();
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

const extractMessage = (exception: unknown) => {
  if (exception instanceof Error) {
    return exception.message;
  }
  if (typeof exception === "string") {
    return exception;
  }
  return "Unhandled error";
};

@Catch()
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpException");

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<any>();
    const request = context.getRequest<any>();

    const requestId =
      (typeof request?.requestId === "string" && request.requestId) ||
      (typeof request?.headers?.["x-request-id"] === "string"
        ? request.headers["x-request-id"]
        : "");

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { error: "Internal server error" };

    const payload: Record<string, unknown> =
      typeof rawResponse === "object" && rawResponse !== null
        ? { ...(rawResponse as Record<string, unknown>) }
        : { error: String(rawResponse) };

    if (requestId) {
      payload.requestId = requestId;
    }

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          event: "http_exception",
          requestId: requestId || undefined,
          method: request?.method || "UNKNOWN",
          route: request?.originalUrl || request?.url || "unknown",
          statusCode: status,
          message: extractMessage(exception),
        })
      );
    }

    response.status(status).json(payload);
  }
}

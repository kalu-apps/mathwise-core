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

const extractStatus = (exception: unknown): number => {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  if (typeof exception !== "object" || exception === null) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
  const maybeStatus = (exception as { status?: unknown }).status;
  if (
    typeof maybeStatus === "number" &&
    Number.isFinite(maybeStatus) &&
    maybeStatus >= 400 &&
    maybeStatus < 600
  ) {
    return Math.floor(maybeStatus);
  }
  const maybeStatusCode = (exception as { statusCode?: unknown }).statusCode;
  if (
    typeof maybeStatusCode === "number" &&
    Number.isFinite(maybeStatusCode) &&
    maybeStatusCode >= 400 &&
    maybeStatusCode < 600
  ) {
    return Math.floor(maybeStatusCode);
  }
  const maybeType = (exception as { type?: unknown }).type;
  if (maybeType === "entity.too.large") {
    return HttpStatus.PAYLOAD_TOO_LARGE;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
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

    const status = extractStatus(exception);

    const rawResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : status === HttpStatus.PAYLOAD_TOO_LARGE
          ? { error: "Слишком большой размер запроса.", code: "request_entity_too_large" }
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

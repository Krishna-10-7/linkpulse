// Consistent error shape for every endpoint: { error: { code, message, fields? } }

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, 'bad_request', message, extra);
export const unauthorized = (message = 'Please sign in.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this.') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
export const conflict = (message, extra) => new HttpError(409, 'conflict', message, extra);

/** Parse a body or query with a zod schema, turning issues into a 400 with field messages. */
export function parse(schema, data) {
  const res = schema.safeParse(data ?? {});
  if (res.success) return res.data;
  const fields = {};
  for (const i of res.error.issues) fields[i.path.join('.') || '_'] = i.message;
  throw badRequest('Some fields need attention.', { fields });
}

export function errorHandler(err, req, reply) {
  if (err instanceof HttpError) {
    if (err.headers) reply.headers(err.headers);
    return reply.code(err.status).send({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err.validation) return reply.code(400).send({ error: { code: 'bad_request', message: err.message } });
  if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: { code: 'bad_request', message: err.message } });
  req.log.error(err);
  return reply.code(500).send({ error: { code: 'server_error', message: 'Something went wrong on our side.' } });
}

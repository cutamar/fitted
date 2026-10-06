/** Thrown from routes to return a specific status with a JSON error. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

// utils/errors.js
class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.status = 403;
  }
}
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}
module.exports = { ForbiddenError, NotFoundError };

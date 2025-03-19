class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    Error.captureStackTrace(this, this.constructor);
  }
}

const handleError = (err, res) => {
  const { statusCode = 500, message } = err;
  res.status(statusCode).json({
    error: {
      message,
      status: statusCode,
    },
  });
};

module.exports = {
  AppError,
  handleError,
};

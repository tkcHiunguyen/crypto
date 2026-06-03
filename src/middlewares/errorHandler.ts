import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

/**
 * Global error handler middleware
 * Catches all errors and returns consistent error responses
 */
export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Log the error with stack trace
    logger.error(`[ERROR] ${req.method} ${req.url}`, {
        error: err.message,
        stack: err.stack,
        ip: req.ip
    });

    // Determine status code
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

    // Send error response
    res.status(statusCode).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

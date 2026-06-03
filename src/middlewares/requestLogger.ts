import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

/**
 * Request logging middleware
 * Logs all incoming requests with method, URL, IP, and response time
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    // Log request
    logger.info(`[REQUEST] ${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`[RESPONSE] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });

    next();
};

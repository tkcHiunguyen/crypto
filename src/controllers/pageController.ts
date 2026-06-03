import { Request, Response } from 'express';
import logger from '../utils/logger.js';

export class PageController {
    /**
     * Render home page with empty coin list
     */
    renderHomePage(req: Request, res: Response) {
        logger.info(`Rendering home page for ${req.ip}`);
        res.render('index', { coins: [] });
    }
}

export default new PageController();

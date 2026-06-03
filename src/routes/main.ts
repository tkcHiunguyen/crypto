import { Router } from 'express';
import pageController from '../controllers/pageController.js';
import coinController from '../controllers/coinController.js';

const router = Router();

// Page routes
router.get('/', pageController.renderHomePage);

// API routes
router.get('/api/coins', coinController.getCoins);
router.get('/api/market-snapshot', coinController.getMarketSnapshot);
router.get('/api/funding-snapshot', coinController.getFundingSnapshot);
router.get('/api/oi-snapshot', coinController.getOiSnapshot);
router.get('/api/patterns', coinController.getPatternCatalog);
router.get('/api/klines', coinController.getKlines);
router.post('/api/pattern-scan', coinController.scanPattern);

export default router;

const express = require('express');
const router = express.Router();
const { scrapeVeterinarias, scrapePaginasAmarillas, scrapeKeyword, getJobStatus, getProspects } = require('../controllers/scraperController');

router.post('/scrape', scrapeVeterinarias);
router.post('/scrape-directorios', scrapePaginasAmarillas);
router.post('/scrape-keyword', scrapeKeyword);
router.get('/jobs', getJobStatus);
router.get('/prospects', getProspects);

module.exports = router;
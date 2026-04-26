const express = require('express');
const router = express.Router();
const { scrapeVeterinarias, scrapePaginasAmarillas, getProspects } = require('../controllers/scraperController');

router.post('/scrape', scrapeVeterinarias);
router.post('/scrape-directorios', scrapePaginasAmarillas);
router.get('/prospects', getProspects);

module.exports = router;
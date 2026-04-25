const express = require('express');
const router = express.Router();
const { scrapeVeterinarias, getProspects } = require('../controllers/scraperController');

router.post('/scrape', scrapeVeterinarias);
router.get('/prospects', getProspects);

module.exports = router;
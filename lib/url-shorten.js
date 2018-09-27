/**
 * Shorten a URL
 */

// Dependencies
const path = require('path');
const fs = require('fs-extra');
const GoogleURL = require('google-url');
require('dotenv').load();

// Main shorten function
async function shorten(url) {
  if (!url) {
    return;
  }

  // Get cache
  let cache = getCache();

  // Check cache
  if (cache[url]) {
    return cache[url];
  }

  // Check for GOOGLE KEY
  if (!process.env.GOOGLE_SHORTENER_API_KEY) {
    throw new Error(
      'Unable to find environment variable GOOGLE_SHORTENER_API_KEY'
    );
  }
}

// Cache
function getCache() {
  // Set up cache
  const cacheDir =
    process.env.CACHE_PATH || path.join(__dirname, '..', '.cache');
  const cachePath = path.join(cachePath, 'shortener-cache.json');
  fs.mkdirpSync(cacheDir);
  let cache = {};
  if (fs.existsSync(cachePath)) {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }

  function save() {
    fs.writeFileSync(cachePath, JSON.stringify(cache));
  }

  return {
    cache,
    cacheDir,
    cachePath,
    save
  };
}

// export
module.exports = shorten;

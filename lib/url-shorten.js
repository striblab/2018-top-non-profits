/**
 * Shorten a URL
 *
 * Google's service is shutting down
 * is.gd has a simple, no auth API but shows warning to user
 */

// Dependencies
const path = require('path');
const fs = require('fs-extra');
const { BitlyClient } = require('bitly');
require('dotenv').load();

// Main shorten function
async function shorten(url) {
  if (!url) {
    return;
  }

  // Get cache
  let { cache, save } = getCache();

  // Check cache
  if (cache[url]) {
    return cache[url];
  }

  // Check for GOOGLE KEY
  if (!process.env.BITLY_SHORTENER_API_KEY) {
    throw new Error(
      'Unable to find environment variable BITLY_SHORTENER_API_KEY'
    );
  }

  // Make bitly client
  const bitly = new BitlyClient(process.env.BITLY_SHORTENER_API_KEY, {});
  let response = await bitly.shorten(url);

  // Cache
  cache[url] = response.url;
  save();
  return response.url;
}

// Cache
function getCache() {
  // Set up cache
  const cacheDir =
    process.env.CACHE_PATH || path.join(__dirname, '..', '.cache-build-data');
  const cachePath = path.join(cacheDir, 'shortener-cache.json');
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

/**
 * Web App entry point. Serves the HTML interface.
 * Expects an 'Index.html' file to exist in the project.
 *
 * @param {Object} e HTTP event object
 * @return {HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Multi-Sheet Web App")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Core function called by the web app frontend upon loading.
 * Retrieves batched data from all sheets, utilizing the script cache
 * to bypass heavy spreadsheet read operations on subsequent loads.
 *
 * @return {Object} An object containing sheet names as keys and 2D arrays as data.
 */
function getWebAppInitData() {
  const cacheKey = "WEB_APP_DATA_MASTER";
  const cache = CacheService.getScriptCache();

  // Try to retrieve cached data first
  const cachedContent = getChunkedCache(cache, cacheKey);
  if (cachedContent) {
    Logger.log("Data successfully retrieved from Cache Service.");
    return JSON.parse(cachedContent);
  }

  Logger.log("Cache miss or expired. Fetching fresh data from Spreadsheet...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const masterData = {};

  // Batch read each sheet efficiently in memory without nested server calls
  sheets.forEach((sheet) => {
    const sheetName = sheet.getName();
    const dataRange = sheet.getDataRange();

    // getValues() pulls the entire sheet grid into a local JavaScript 2D array in a single request
    const values = dataRange.getValues();

    // Only include sheets that actually contain data rows
    if (values.length > 0 && values[0].length > 0) {
      masterData[sheetName] = values;
    } else {
      masterData[sheetName] = [];
    }
  });

  // Stringify the master data object to prepare it for the Cache Service
  const stringifiedData = JSON.stringify(masterData);

  // Cache the fresh data for 30 minutes (1800 seconds) to speed up subsequent user sessions
  // Apps Script cache maximum duration is 6 hours (21600 seconds)
  setChunkedCache(cache, cacheKey, stringifiedData, 1800);

  return masterData;
}

/**
 * Helper function to safely write large stringified data to CacheService.
 * Apps Script restricts individual cache values to 100KB. This chunking method
 * splits large datasets into multiple sub-keys automatically.
 *
 * @param {Cache} cache The Apps Script Cache instance
 * @param {string} key The master key identifier
 * @param {string} value The full stringified JSON string
 * @param {number} expirationInSeconds Time to live in seconds
 */
function setChunkedCache(cache, key, value, expirationInSeconds) {
  const chunkSize = 90 * 1024; // 90KB safety threshold below the 100KB limit
  const totalChunks = Math.ceil(value.length / chunkSize);
  const cacheBatch = {};

  // Store metadata tracking how many chunks compose this specific data payload
  cacheBatch[key + "_meta"] = JSON.stringify({ chunks: totalChunks });

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    cacheBatch[key + "_chunk_" + i] = value.substring(start, end);
  }

  // Save all chunks simultaneously using the atomic putAll method
  cache.putAll(cacheBatch, expirationInSeconds);
}

/**
 * Helper function to reassemble chunked string data from CacheService.
 *
 * @param {Cache} cache The Apps Script Cache instance
 * @param {string} key The master key identifier
 * @return {string|null} The full reassembled string, or null if missing
 */
function getChunkedCache(cache, key) {
  const metaString = cache.get(key + "_meta");
  if (!metaString) return null;

  const meta = JSON.parse(metaString);
  const keysToFetch = [];

  for (let i = 0; i < meta.chunks; i++) {
    keysToFetch.push(key + "_chunk_" + i);
  }

  // Multi-get fetches all string pieces in a single network roundtrip
  const fetchedChunks = cache.getAll(keysToFetch);
  let assembledString = "";

  for (let i = 0; i < meta.chunks; i++) {
    const chunk = fetchedChunks[key + "_chunk_" + i];
    if (!chunk) return null; // If any part of the cache expired early, abort
    assembledString += chunk;
  }

  return assembledString;
}

/**
 * Invalidation utility function. Force-clears the web application data cache.
 * Tie this function to an Spreadsheet 'onEdit' installable trigger or a button
 * inside the sheet when administrative modifications require an instant web app refresh.
 */
function clearWebAppCache() {
  const cacheKey = "WEB_APP_DATA_MASTER";
  const cache = CacheService.getScriptCache();
  const metaString = cache.get(cacheKey + "_meta");

  if (metaString) {
    const meta = JSON.parse(metaString);
    const keysToRemove = [cacheKey + "_meta"];

    for (let i = 0; i < meta.chunks; i++) {
      keysToRemove.push(cacheKey + "_chunk_" + i);
    }

    cache.removeAll(keysToRemove);
    Logger.log("Web app cache keys explicitly destroyed.");
  }
}

import { APP, getSpreadSheetId, TABLE_NAMES } from "./Utilities";

export const TEDinit = () => {
  const cacheKey = APP.cacheKey;
  const cache = CacheService.getScriptCache() as unknown as Cache;
  const cachedContent = getChunkedCache(cache, cacheKey);

  //   Check the cache first for data
  if (cachedContent) {
    Logger.log("Data successfully retrieved from Cache Service.");
    return JSON.parse(cachedContent);
  }

  //   Make a fresh read if there is no cache returned
  Logger.log("Cache miss or expired. Fetching fresh data from Spreadsheet...");

  const id = getSpreadSheetId();
  const range = TABLE_NAMES.map((table) => `'${table}'`);
  const rawData = Sheets?.Spreadsheets.Values.batchGet(id, range);

  console.log(rawData);
};

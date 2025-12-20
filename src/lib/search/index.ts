/**
 * Web Search Module - searches Reddit, Stack Overflow for patterns
 *
 * Finds community recommendations and best practices for code patterns.
 * Results are cached to avoid repeated queries.
 */

import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

export interface SearchResult {
  source: "reddit" | "stackoverflow" | "docs";
  title: string;
  url: string;
  snippet: string;
  score: number;
  timestamp: string;
}

export interface SearchCache {
  query: string;
  results: SearchResult[];
  cachedAt: string;
}

const CACHE_DIR = ".crit/cache/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cache file path for a query
 */
function getCachePath(projectPath: string, query: string): string {
  const hash = Buffer.from(query).toString("base64url").slice(0, 32);
  return join(projectPath, CACHE_DIR, `${hash}.json`);
}

/**
 * Check if cached result is still valid
 */
function isCacheValid(cache: SearchCache): boolean {
  const cachedTime = new Date(cache.cachedAt).getTime();
  return Date.now() - cachedTime < CACHE_TTL_MS;
}

/**
 * Load from cache if valid
 */
function loadFromCache(projectPath: string, query: string): SearchResult[] | null {
  const cachePath = getCachePath(projectPath, query);
  if (!existsSync(cachePath)) return null;

  try {
    const cache: SearchCache = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (isCacheValid(cache)) {
      return cache.results;
    }
  } catch {
    // Invalid cache, ignore
  }
  return null;
}

/**
 * Save to cache
 */
function saveToCache(projectPath: string, query: string, results: SearchResult[]): void {
  const cacheDir = join(projectPath, CACHE_DIR);
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  const cache: SearchCache = {
    query,
    results,
    cachedAt: new Date().toISOString(),
  };

  writeFileSync(getCachePath(projectPath, query), JSON.stringify(cache, null, 2));
}

/**
 * Search Reddit for programming discussions
 */
async function searchReddit(query: string, subreddits: string[] = ["typescript", "bun", "programming", "webdev"]): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  for (const subreddit of subreddits.slice(0, 2)) { // Limit to avoid rate limits
    try {
      const searchUrl = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&limit=5&sort=relevance`;

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "crit-analyzer/1.0",
        },
      });

      if (!response.ok) continue;

      const data = (await response.json()) as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
      const posts = data?.data?.children || [];

      for (const post of posts) {
        const p = post.data as { title?: string; permalink?: string; selftext?: string; score?: number; created_utc?: number } | undefined;
        if (!p) continue;

        results.push({
          source: "reddit",
          title: p.title || "",
          url: `https://reddit.com${p.permalink || ""}`,
          snippet: (p.selftext || "").slice(0, 300),
          score: p.score || 0,
          timestamp: new Date((p.created_utc || 0) * 1000).toISOString(),
        });
      }
    } catch {
      // Ignore errors, continue with other sources
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Search Stack Overflow
 */
async function searchStackOverflow(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    const searchUrl = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&filter=withbody&pagesize=5`;

    const response = await fetch(searchUrl, {
      headers: {
        "Accept-Encoding": "gzip",
      },
    });

    if (!response.ok) return results;

    const data = (await response.json()) as { items?: Array<{ title?: string; link?: string; body?: string; score?: number; creation_date?: number }> };
    const items = data?.items || [];

    for (const item of items) {
      results.push({
        source: "stackoverflow",
        title: item.title || "",
        url: item.link || "",
        snippet: stripHtml(item.body || "").slice(0, 300),
        score: item.score || 0,
        timestamp: new Date((item.creation_date || 0) * 1000).toISOString(),
      });
    }
  } catch {
    // Ignore errors
  }

  return results;
}

/**
 * Strip HTML tags from string
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a search query for a code pattern
 */
export function buildQuery(pattern: string, language: string = "typescript"): string {
  // Clean up the pattern for searching
  const cleaned = pattern
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${language} ${cleaned} best practice`;
}

/**
 * Search for recommendations about a code pattern
 */
export async function searchForPattern(
  projectPath: string,
  pattern: string,
  options: {
    language?: string;
    subreddits?: string[];
    skipCache?: boolean;
  } = {}
): Promise<SearchResult[]> {
  const query = buildQuery(pattern, options.language || "typescript");

  // Check cache first
  if (!options.skipCache) {
    const cached = loadFromCache(projectPath, query);
    if (cached) return cached;
  }

  // Search in parallel
  const [redditResults, soResults] = await Promise.all([
    searchReddit(query, options.subreddits),
    searchStackOverflow(query),
  ]);

  const results = [...redditResults, ...soResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // Cache results
  saveToCache(projectPath, query, results);

  return results;
}

/**
 * Search for simplification suggestions
 */
export async function searchSimplification(
  projectPath: string,
  codeDescription: string
): Promise<SearchResult[]> {
  const query = `${codeDescription} simplify refactor better way`;
  return searchForPattern(projectPath, query);
}

/**
 * Search for known issues with a pattern
 */
export async function searchIssues(
  projectPath: string,
  pattern: string
): Promise<SearchResult[]> {
  const query = `${pattern} problem issue gotcha`;
  return searchForPattern(projectPath, query);
}

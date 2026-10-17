// Build-time content loading (1B-01). Content is data exported by the engine and validated by
// `scripts/validate-content.mjs` before every build; pages only read it here, never render it as HTML.
//
// Directory: env LINKEDIA_CONTENT_DIR (absolute, or relative to the project root), default `content`.
// Layout: articles/{article_id}.json · editions/{YYYY-MM-DD}.json · tags/catalog.json.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { Article, Channel, Edition, TagCatalog } from '../types/contracts';

export interface EditionWithArticles {
  edition: Edition;
  articles: Article[]; // display order; the first is the lead story
}

export interface Content {
  articles: Article[];
  editions: EditionWithArticles[]; // newest first
  tags: Map<string, TagCatalog['tags'][number]>;
}

export function contentDir(): string {
  const configured = process.env.LINKEDIA_CONTENT_DIR || 'content';
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
}

let cached: { dir: string; content: Content } | undefined;

export function loadContent(dir: string = contentDir()): Content {
  if (cached?.dir === dir) return cached.content;
  const articles = jsonFiles(join(dir, 'articles')).map((p) => readJson<Article>(p));
  const byId = new Map(articles.map((a) => [a.article_id, a]));
  const editions = jsonFiles(join(dir, 'editions'))
    .map((p) => readJson<Edition>(p))
    .sort((a, b) => b.edition_date.localeCompare(a.edition_date))
    .map((edition) => ({
      edition,
      articles: edition.article_ids.map((id) => byId.get(id)).filter((a): a is Article => a !== undefined),
    }));
  const catalogPath = join(dir, 'tags', 'catalog.json');
  const catalog = existsSync(catalogPath) ? readJson<TagCatalog>(catalogPath) : { tags: [] };
  const content = { articles, editions, tags: new Map(catalog.tags.map((t) => [t.key, t])) };
  cached = { dir, content };
  return content;
}

/** Published articles (those in some edition), newest edition first, edition order within a date. */
export function publishedArticles(content: Content): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const { articles } of content.editions) {
    for (const a of articles) {
      if (!seen.has(a.article_id)) {
        seen.add(a.article_id);
        out.push(a);
      }
    }
  }
  return out;
}

export const CHANNELS: readonly Channel[] = ['ai_engineering', 'ai_leadership', 'ai_knowledge'];

export function editionOf(content: Content, article: Article): Edition | undefined {
  return content.editions.find((e) => e.edition.edition_date === article.edition_date)?.edition;
}

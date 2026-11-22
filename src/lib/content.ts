// Build-time content loading (1B-01). Content is data exported by the engine and validated by
// `scripts/validate-content.mjs` before every build; pages only read it here, never render it as HTML.
//
// Directory: env LINKEDIA_CONTENT_DIR (absolute, or relative to the project root), default `content`.
// Layout: articles/{article_id}.json · editions/{YYYY-MM-DD}.json · tags/catalog.json.
//
// Two contract versions coexist (V2-05): files stay as exported, and this reader maps both to one v2-shaped view.
// A v1 article's `channel` becomes its editoria (engineering and knowledge → the merged "IA na prática"); a v1 file
// has no per-article `published_at` or edition `updated_at`, and pages show none for it. IDs, slugs and dates are
// read as they are.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { Article as ArticleV1, Channel, Edition as EditionV1, TagCatalog } from '../types/contracts';
import type { ArticleV2, EditionV2, Editoria } from '../types/contracts.v2';

export type { Editoria };

/** An article as pages render it, from either contract version. */
export type Article = Omit<ArticleV2, 'schema_version' | 'published_at'> & {
  schema_version: ArticleV1['schema_version'] | ArticleV2['schema_version'];
  published_at?: string; // v2 only: this article's publication batch
};

/** An edition as pages render it, from either contract version. */
export type Edition = Omit<EditionV2, 'schema_version' | 'updated_at'> & {
  schema_version: EditionV1['schema_version'] | EditionV2['schema_version'];
  updated_at?: string; // v2 only: the latest batch added to the day
};

/** The six editorias (D-079, labels D-084), in navigation order. */
export const EDITORIAS: readonly Editoria[] = [
  'ai_engineering_knowledge',
  'ai_leadership',
  'marketing',
  'health',
  'china',
  'latest_news',
];

/** v1 channel → v2 editoria (IDEA_BOX §2): engineering and knowledge merge; leadership keeps its section. */
export const V1_EDITORIA: Record<Channel, Editoria> = {
  ai_engineering: 'ai_engineering_knowledge',
  ai_knowledge: 'ai_engineering_knowledge',
  ai_leadership: 'ai_leadership',
};

export function readArticle(raw: ArticleV1 | ArticleV2): Article {
  if (raw.schema_version === '2.0.0') return raw;
  const { channel, ...rest } = raw;
  return { ...rest, editoria: V1_EDITORIA[channel] };
}

export function readEdition(raw: EditionV1 | EditionV2): Edition {
  return raw;
}

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
  const articles = jsonFiles(join(dir, 'articles')).map((p) => readArticle(readJson<ArticleV1 | ArticleV2>(p)));
  const byId = new Map(articles.map((a) => [a.article_id, a]));
  const editions = jsonFiles(join(dir, 'editions'))
    .map((p) => readEdition(readJson<EditionV1 | EditionV2>(p)))
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

export function editionOf(content: Content, article: Article): Edition | undefined {
  return content.editions.find((e) => e.edition.edition_date === article.edition_date)?.edition;
}

/**
 * Whether an edition's cards show each story's own publication time: only when its articles came in more than one
 * batch (a v2 day with several publications). A single batch, or any v1 edition, shows the edition time alone.
 */
export function showsArticleTimes(articles: Article[]): boolean {
  return new Set(articles.map((a) => a.published_at).filter(Boolean)).size > 1;
}

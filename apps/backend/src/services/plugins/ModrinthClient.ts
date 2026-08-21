import { prisma } from "../../lib/prisma.js";
import { APP_USER_AGENT } from "@serverlab/shared";
import type {
  ModrinthProject,
  ModrinthProjectSearchHit,
  ModrinthSearchResponse,
  ModrinthVersion,
  ModrinthVersionDependency,
  ModrinthVersionFile,
} from "@serverlab/shared";

const API_ROOT = "https://api.modrinth.com/v2";
const ALLOWED_HOSTS = ["api.modrinth.com", "cdn.modrinth.com"];
const SEARCH_TTL_MS = 5 * 60 * 1000;
const METADATA_TTL_MS = 12 * 60 * 60 * 1000;

type CacheKind = "search" | "project" | "versions" | "tags" | "members";

interface RawSearchResponse {
  hits?: RawSearchHit[];
  total_hits?: number;
  offset?: number;
  limit?: number;
}

interface RawSearchHit {
  project_id?: string;
  slug?: string;
  author?: string;
  title?: string;
  description?: string;
  project_type?: string;
  icon_url?: string | null;
  downloads?: number;
  follows?: number;
  categories?: string[];
  display_categories?: string[];
  versions?: string[];
  date_modified?: string;
  license?: string;
}

interface RawProject {
  id?: string;
  slug?: string;
  author?: string;
  team?: string | null;
  title?: string;
  description?: string;
  body?: string;
  project_type?: string;
  icon_url?: string | null;
  downloads?: number;
  followers?: number;
  categories?: string[];
  loaders?: string[];
  game_versions?: string[];
  license?: { id?: string; name?: string } | string;
  updated?: string;
  source_url?: string | null;
  issues_url?: string | null;
  wiki_url?: string | null;
}

interface RawProjectMember {
  role?: string;
  accepted?: boolean;
  ordering?: number;
  user?: {
    username?: string;
    name?: string | null;
  };
}

interface RawVersion {
  id?: string;
  project_id?: string;
  name?: string;
  version_number?: string;
  version_type?: "release" | "beta" | "alpha";
  loaders?: string[];
  game_versions?: string[];
  date_published?: string;
  files?: RawVersionFile[];
  dependencies?: RawDependency[];
}

interface RawVersionFile {
  url?: string;
  filename?: string;
  primary?: boolean;
  size?: number;
  hashes?: {
    sha1?: string;
    sha512?: string;
  };
}

interface RawDependency {
  project_id?: string | null;
  version_id?: string | null;
  file_name?: string | null;
  dependency_type?: "required" | "optional" | "incompatible" | "embedded";
}

export interface ModrinthSearchInput {
  query?: string;
  loader?: string;
  minecraftVersion?: string;
  category?: string;
  strictCompatibility?: boolean;
  sort?: string;
  offset?: number;
  limit?: number;
}

export class ModrinthClient {
  async search(input: ModrinthSearchInput): Promise<ModrinthSearchResponse> {
    const params = new URLSearchParams();
    if (input.query?.trim()) params.set("query", input.query.trim());
    params.set("index", normalizeSort(input.sort));
    params.set("offset", String(input.offset ?? 0));
    params.set("limit", String(Math.min(Math.max(input.limit ?? 20, 1), 40)));
    params.set("facets", JSON.stringify(buildFacets(input)));

    const key = `search:${params.toString()}`;
    const data = await this.getCachedOrFetch<RawSearchResponse>(
      key,
      "search",
      `${API_ROOT}/search?${params.toString()}`,
      SEARCH_TTL_MS
    );

    return {
      hits: (data.payload.hits ?? []).map(normalizeSearchHit),
      totalHits: data.payload.total_hits ?? 0,
      offset: data.payload.offset ?? input.offset ?? 0,
      limit: data.payload.limit ?? input.limit ?? 20,
      offline: data.offline,
    };
  }

  async getProject(idOrSlug: string): Promise<{ project: ModrinthProject; offline: boolean }> {
    const id = encodeURIComponent(idOrSlug);
    const data = await this.getCachedOrFetch<RawProject>(
      `project:${idOrSlug}`,
      "project",
      `${API_ROOT}/project/${id}`,
      METADATA_TTL_MS
    );
    let project = normalizeProject(data.payload);

    // Team-owned projects commonly have no author field. Resolve the public
    // member list so the UI can show a useful author without exposing private data.
    if (!project.author && !data.offline) {
      try {
        const members = await this.getCachedOrFetch<RawProjectMember[]>(
          `members:${idOrSlug}`,
          "members",
          `${API_ROOT}/project/${id}/members`,
          METADATA_TTL_MS
        );
        const owner = [...members.payload]
          .filter((member) => member.accepted !== false && member.user?.username)
          .sort((a, b) => {
            const ownerRank = (member: RawProjectMember) =>
              member.role?.toLowerCase() === "owner" ? 0 : 1;
            return ownerRank(a) - ownerRank(b) || (a.ordering ?? 0) - (b.ordering ?? 0);
          })[0];
        const author = owner?.user?.username ?? owner?.user?.name ?? null;
        if (author) project = { ...project, author };
      } catch {
        // The project remains usable when member metadata is unavailable.
      }
    }

    return { project, offline: data.offline };
  }

  async listVersions(projectId: string): Promise<{ versions: ModrinthVersion[]; offline: boolean }> {
    const id = encodeURIComponent(projectId);
    const data = await this.getCachedOrFetch<RawVersion[]>(
      `versions:${projectId}`,
      "versions",
      `${API_ROOT}/project/${id}/version`,
      METADATA_TTL_MS
    );
    return { versions: data.payload.map(normalizeVersion), offline: data.offline };
  }

  async getVersion(versionId: string): Promise<ModrinthVersion> {
    const id = encodeURIComponent(versionId);
    const data = await this.getCachedOrFetch<RawVersion>(
      `version:${versionId}`,
      "versions",
      `${API_ROOT}/version/${id}`,
      METADATA_TTL_MS
    );
    return normalizeVersion(data.payload);
  }

  async getProjectNames(projectIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(projectIds.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    const params = new URLSearchParams({
      ids: JSON.stringify(uniqueIds),
    });
    const data = await this.getCachedOrFetch<RawProject[]>(
      `projects:${uniqueIds.sort().join(",")}`,
      "project",
      `${API_ROOT}/projects?${params.toString()}`,
      METADATA_TTL_MS
    );
    const names = new Map(data.payload.map((project) => [String(project.id), project.title ?? String(project.id)]));
    await Promise.all(
      uniqueIds.map(async (projectId) => {
        const current = names.get(projectId);
        if (current && current !== projectId) return;
        try {
          const project = await this.getProject(projectId);
          names.set(projectId, project.project.title);
        } catch {
          // Keep the project id only when Modrinth cannot resolve a title offline.
        }
      })
    );
    return names;
  }

  assertAllowedDownloadUrl(url: string): URL {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("Modrinth downloads must use HTTPS");
    }
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Modrinth download host is not allowed: ${parsed.hostname}`);
    }
    return parsed;
  }

  private async getCachedOrFetch<T>(
    key: string,
    kind: CacheKind,
    url: string,
    ttlMs: number
  ): Promise<{ payload: T; offline: boolean }> {
    const cached = await prisma.modrinthCacheEntry.findUnique({ where: { key } });
    const now = new Date();
    if (cached && cached.expiresAt > now) {
      return { payload: JSON.parse(cached.payloadJson) as T, offline: false };
    }

    try {
      const payload = await this.fetchJson<T>(url);
      await prisma.modrinthCacheEntry.upsert({
        where: { key },
        update: {
          kind,
          payloadJson: JSON.stringify(payload),
          cachedAt: now,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
        create: {
          key,
          kind,
          payloadJson: JSON.stringify(payload),
          cachedAt: now,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      });
      return { payload, offline: false };
    } catch (error) {
      if (cached) return { payload: JSON.parse(cached.payloadJson) as T, offline: true };
      throw error;
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const parsed = this.assertAllowedDownloadUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(parsed, {
        signal: controller.signal,
        headers: {
          "User-Agent": APP_USER_AGENT,
          Accept: "application/json",
        },
      });
      if (response.status === 429) {
        const reset = response.headers.get("X-Ratelimit-Reset");
        throw new Error(reset ? `Modrinth rate limit reached. Retry after ${reset}.` : "Modrinth rate limit reached.");
      }
      if (!response.ok) {
        throw new Error(`Modrinth request failed with HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildFacets(input: ModrinthSearchInput): string[][] {
  const facets = [["project_type:plugin"]];
  if (input.strictCompatibility && input.loader) facets.push([`categories:${input.loader}`]);
  if (input.strictCompatibility && input.minecraftVersion) {
    facets.push([`versions:${input.minecraftVersion}`]);
  }
  if (input.category) facets.push([`categories:${input.category}`]);
  return facets;
}

function normalizeSort(sort: string | undefined): string {
  if (sort === "downloads" || sort === "follows" || sort === "newest" || sort === "updated") {
    return sort;
  }
  return "relevance";
}

function normalizeSearchHit(hit: RawSearchHit): ModrinthProjectSearchHit {
  return {
    id: required(hit.project_id, "project id"),
    slug: required(hit.slug, "project slug"),
    title: required(hit.title, "project title"),
    author: hit.author ?? null,
    description: hit.description ?? "",
    projectType: hit.project_type ?? "plugin",
    iconUrl: hit.icon_url ?? null,
    downloads: hit.downloads ?? 0,
    followers: hit.follows ?? 0,
    categories: hit.display_categories ?? hit.categories ?? [],
    loaders: hit.categories ?? [],
    gameVersions: hit.versions ?? [],
    license: hit.license ?? null,
    updatedAt: hit.date_modified ?? null,
    sourceUrl: null,
    issuesUrl: null,
    wikiUrl: null,
    compatibility: null,
  };
}

function normalizeProject(project: RawProject): ModrinthProject {
  const license =
    typeof project.license === "string"
      ? project.license
      : project.license?.name ?? project.license?.id ?? null;
  return {
    id: required(project.id, "project id"),
    slug: required(project.slug, "project slug"),
    title: required(project.title, "project title"),
    author: project.author ?? null,
    description: project.description ?? "",
    body: project.body ?? null,
    projectType: project.project_type ?? "plugin",
    iconUrl: project.icon_url ?? null,
    downloads: project.downloads ?? 0,
    followers: project.followers ?? 0,
    categories: project.categories ?? [],
    loaders: project.loaders ?? [],
    gameVersions: project.game_versions ?? [],
    license,
    updatedAt: project.updated ?? null,
    sourceUrl: project.source_url ?? null,
    issuesUrl: project.issues_url ?? null,
    wikiUrl: project.wiki_url ?? null,
  };
}

function normalizeVersion(version: RawVersion): ModrinthVersion {
  return {
    id: required(version.id, "version id"),
    projectId: required(version.project_id, "project id"),
    name: version.name ?? version.version_number ?? "Unknown version",
    versionNumber: required(version.version_number, "version number"),
    versionType: version.version_type ?? "release",
    loaders: version.loaders ?? [],
    gameVersions: version.game_versions ?? [],
    datePublished: version.date_published ?? new Date().toISOString(),
    files: (version.files ?? []).map(normalizeFile),
    dependencies: (version.dependencies ?? []).map(normalizeDependency),
    compatibility: null,
  };
}

function normalizeFile(file: RawVersionFile): ModrinthVersionFile {
  return {
    url: required(file.url, "file url"),
    filename: required(file.filename, "file name"),
    primary: file.primary === true,
    size: file.size ?? 0,
    hashes: {
      sha1: file.hashes?.sha1,
      sha512: file.hashes?.sha512,
    },
  };
}

function normalizeDependency(dependency: RawDependency): ModrinthVersionDependency {
  return {
    projectId: dependency.project_id ?? null,
    versionId: dependency.version_id ?? null,
    fileName: dependency.file_name ?? null,
    dependencyType: dependency.dependency_type ?? "required",
  };
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Modrinth response is missing ${label}`);
  return value;
}

export const modrinthClient = new ModrinthClient();

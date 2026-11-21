import fs from "node:fs/promises";
import path from "node:path";
import type { LoadContext, Plugin } from "@docusaurus/types";
import type { LoadedContent, LoadedVersion } from "@docusaurus/plugin-content-docs";
import { load } from "cheerio";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

type SidebarItem = LoadedVersion["sidebars"][string][number];

function sidebarDocIds(items: SidebarItem[]): string[] {
  return items.flatMap((item) => {
    if (item.type === "doc" || item.type === "ref") return [item.id];
    if (item.type !== "category") return [];
    const id = item.link?.type === "doc" ? [item.link.id] : [];
    return [...id, ...sidebarDocIds(item.items)];
  });
}

function renderMarkdown(html: string, source: URL, markdown: TurndownService): string {
  const $ = load(html);
  const article = $("article .theme-doc-markdown").first();
  if (!article.length) throw new Error(`No rendered documentation at ${source}`);

  article.find(".hash-link, script, style").remove();
  // Keep labels attached to the examples when the interactive tabs are flattened.
  article.find("[role=tablist]").each((_, node) => {
    const tabs = $(node);
    const labels = tabs.children("[role=tab]").map((_, tab) => $(tab).text()).get();
    const panels = tabs.next().children("[role=tabpanel]");
    if (!labels.length || labels.length !== panels.length) return;
    panels.each((index, panel) => {
      $(panel).prepend($("<p>").append($("<strong>").text(labels[index])));
    });
    tabs.remove();
  });
  article.find("a[href], img[src]").each((_, node) => {
    const element = $(node);
    const attr = node.tagName === "a" ? "href" : "src";
    const value = element.attr(attr);
    if (!value?.trim()) {
      element.removeAttr(attr);
      return;
    }
    const url = new URL(value, source);
    if (/\.mdx$/i.test(decodeURIComponent(url.pathname))) {
      throw new Error(`Unresolved documentation source link in ${source}: ${value}`);
    }
    element.attr(attr, url.href);
  });

  // Prism renders each line in its own span with no intervening newline.
  article.find("pre > code").each((_, node) => {
    const code = $(node);
    const pre = code.parent();
    const language = [pre.attr("class"), pre.parent().attr("class")]
      .map((className) => className?.match(/(?:^|\s)language-([^\s]+)/)?.[1])
      .find(Boolean);
    const lines = code.children(".token-line");
    if (lines.length) {
      code.text(lines.map((_, line) => $(line).text()).get().join("\n").replaceAll("\u200b", ""));
    }
    if (language) code.attr("class", `language-${language}`);
  });

  return markdown.turndown(article.html() ?? "");
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Thanks to @jharrell and Prisma team. Apache-2.0 content
// https://github.com/prisma/docs/commit/bc5b452b34ebdce8e89ccbe0c7f029e8b6ef1239
export default function llmsTxtPlugin({ siteConfig, baseUrl }: LoadContext): Plugin {
  return {
    name: "llms-txt-plugin",
    async postBuild({ outDir, plugins }) {
      // Docusaurus exposes other plugins' postBuild content without its generic type.
      const docsContent = plugins.find(
        (plugin) => plugin.name === "docusaurus-plugin-content-docs",
      )?.content as LoadedContent | undefined;
      const current = docsContent?.loadedVersions.find((version) => version.versionName === "current");
      if (!current?.docs.length) throw new Error("No current docs for the LLM exports");
      const stable = docsContent?.loadedVersions.find((version) => version.isLast);
      const stableById = new Map(stable?.docs.map((doc) => [doc.id, doc]));
      const currentById = new Map(current.docs.map((doc) => [doc.id, doc]));

      // Preserve the reading order of the sidebar, then append unlinked docs.
      const ids = new Set([
        ...Object.values(current.sidebars).flatMap(sidebarDocIds),
        ...[...currentById.keys()].sort((a, b) => a.localeCompare(b)),
      ]);
      const docs = [...ids].flatMap((id) => {
        const doc = currentById.get(id);
        return doc ? [stableById.get(id) ?? doc] : [];
      });

      const site = new URL(baseUrl, siteConfig.url);
      const markdown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" }).use(gfm);
      const sources = new Set<string>();
      const pages = [];
      for (const doc of docs) {
        const source = new URL(doc.permalink, site);
        if (source.origin !== site.origin || !source.pathname.startsWith(site.pathname)) {
          throw new Error(`Documentation source is outside the site: ${source}`);
        }
        if (sources.has(source.href)) throw new Error(`Duplicate documentation route: ${source}`);
        sources.add(source.href);

        const route = decodeURIComponent(source.pathname.slice(site.pathname.length));
        const filename = path.join(outDir, route, "index.html");
        const html = await fs.readFile(filename, "utf8");
        const body = renderMarkdown(html, source, markdown);
        if (!body.trim()) throw new Error(`Empty rendered documentation at ${source}`);
        if (/^[ \t]*`{3,}[^\n]*\bfile=\S+/m.test(body)) {
          throw new Error(`Unexpanded snippet directive in ${source}`);
        }
        pages.push({
          title: singleLine(doc.title),
          description: singleLine(doc.description),
          source: source.href,
          lastUpdated: doc.lastUpdatedAt
            ? new Date(doc.lastUpdatedAt).toISOString().slice(0, 10)
            : undefined,
          body,
        });
      }

      // The index and corpus use the same ordered pages, with one record per unique route.
      const corpusUrl = new URL("llms-full.txt", site);
      const index = pages.map(({ title, description, source }) => {
        const label = title.replace(/[\\\[\]]/g, "\\$&");
        return `- [${label}](<${source}>)${description ? `: ${description}` : ""}`;
      });
      const corpus = pages.map(({ title, description, source, lastUpdated, body }) => [
        "---",
        `title: ${JSON.stringify(title)}`,
        `description: ${JSON.stringify(description)}`,
        `source: ${source}`,
        ...(lastUpdated ? [`last_updated: ${lastUpdated}`] : []),
        "",
        body,
      ].join("\n"));

      await Promise.all([
        fs.writeFile(
          path.join(outDir, "llms.txt"),
          `# ${siteConfig.title}\n\n> Full documentation: [llms-full.txt](${corpusUrl})\n\n## Docs\n\n${index.join("\n")}\n`,
        ),
        fs.writeFile(path.join(outDir, "llms-full.txt"), `${corpus.join("\n\n")}\n`),
      ]);
    },
  };
}

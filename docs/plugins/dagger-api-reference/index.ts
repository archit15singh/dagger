import path from "path";
import versions from "../../versions.json";
import type { LoadContext, Plugin } from "@docusaurus/types";
import type { ApiModel } from "../../src/components/api/data";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseSchema } = require("./schema.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const defaultCoreTypes: string[] = require("./coreTypes.js");

export type DaggerApiOptions = {
  /** Path to the core schema SDL, relative to the site dir. */
  schemaPath?: string;
  /** Core type names to publish; defaults to ./coreTypes.js. */
  types?: string[];
};

/**
 * Build one schema module per docs version. The API reference MDX imports its
 * own version's model, keeping the schemas out of site-wide JavaScript.
 */
export default function daggerApiReference(
  context: LoadContext,
  options: DaggerApiOptions = {}
): Plugin<Record<string, ApiModel>> {
  const schemaPath = path.resolve(
    context.siteDir,
    options.schemaPath ?? "docs-graphql/schema.graphqls"
  );
  const types = options.types ?? defaultCoreTypes;
  const schemaPaths = {
    current: schemaPath,
    ...Object.fromEntries(versions.map((version) => [
      version,
      path.join(context.siteDir, "versioned_docs", `version-${version}`, "schema.graphqls"),
    ])),
  };

  return {
    name: "dagger-api-reference",
    async loadContent() {
      return Object.fromEntries(
        Object.entries(schemaPaths).map(([version, file]) => [version, parseSchema(file, types)])
      );
    },
    async contentLoaded({ content, actions }) {
      await Promise.all(
        Object.entries(content).map(([version, model]) =>
          actions.createData(`${version}.json`, JSON.stringify(model))
        )
      );
    },
    getPathsToWatch() {
      return Object.values(schemaPaths);
    },
  };
}

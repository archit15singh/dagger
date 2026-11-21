import path from "path";
import versions from "../../versions.json";
import type { LoadContext, Plugin } from "@docusaurus/types";

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
 * dagger-api-reference parses each docs version's core GraphQL schema at build
 * time and exposes the models as plugin global data. The reference React
 * components (src/components/api) read it via usePluginData, so the published
 * reference is generated straight from the schema — the same idea as Dang's
 * stdlib generator, done the Docusaurus-native way.
 */
export default function daggerApiReference(
  context: LoadContext,
  options: DaggerApiOptions = {}
): Plugin<unknown> {
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
      actions.setGlobalData(content);
    },
    getPathsToWatch() {
      return Object.values(schemaPaths);
    },
  };
}

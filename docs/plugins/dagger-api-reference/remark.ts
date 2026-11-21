import path from "path";
import type { Root } from "mdast";
import type { MdxjsEsm } from "mdast-util-mdx";
import type { VFile } from "vfile";
import { EXIT, visit } from "unist-util-visit";
import versions from "../../versions.json";

function modelExport(version: string): MdxjsEsm {
  const source = `@generated/dagger-api-reference/default/${version}.json`;
  return {
    type: "mdxjsEsm",
    value: `export { default as daggerApiModel } from "${source}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [{
          type: "ExportNamedDeclaration",
          declaration: null,
          specifiers: [{
            type: "ExportSpecifier",
            local: { type: "Identifier", name: "default" },
            exported: { type: "Identifier", name: "daggerApiModel" },
          }],
          source: { type: "Literal", value: source },
        }],
      },
    },
  };
}

export default function remarkApiModel({ siteDir }: { siteDir: string }) {
  return (tree: Root, file: VFile) => {
    let usesApiModel = false;
    visit(tree, ["mdxJsxFlowElement", "mdxJsxTextElement"], (node) => {
      if (node.name === "ApiType" || node.name === "ApiTypeList") {
        usesApiModel = true;
        return EXIT;
      }
    });
    if (!usesApiModel) return;

    const [directory, versionDir] = path.relative(siteDir, file.path).split(path.sep);
    const version = directory === "current_docs"
      ? "current"
      : directory === "versioned_docs"
        ? versions.find((name) => versionDir === `version-${name}`)
        : undefined;
    if (!version) {
      throw new Error(`Cannot select a Dagger API schema for ${file.path}`);
    }

    tree.children.unshift(modelExport(version));
  };
}

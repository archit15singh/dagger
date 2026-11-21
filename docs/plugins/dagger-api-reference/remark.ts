import path from "path";
import type { Root } from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement, MdxjsEsm } from "mdast-util-mdx";
import type { VFile } from "vfile";
import { visit } from "unist-util-visit";
import versions from "../../versions.json";

const modelName = "daggerApiModel";

function modelImport(version: string): MdxjsEsm {
  const source = `@generated/dagger-api-reference/default/${version}.json`;
  return {
    type: "mdxjsEsm",
    value: `import ${modelName} from "${source}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [{
          type: "ImportDeclaration",
          specifiers: [{
            type: "ImportDefaultSpecifier",
            local: { type: "Identifier", name: modelName },
          }],
          source: { type: "Literal", value: source },
        }],
      },
    },
  };
}

export default function remarkApiModel({ siteDir }: { siteDir: string }) {
  return (tree: Root, file: VFile) => {
    const apiElements: (MdxJsxFlowElement | MdxJsxTextElement)[] = [];
    visit(tree, ["mdxJsxFlowElement", "mdxJsxTextElement"], (node) => {
      if (node.name === "ApiType" || node.name === "ApiTypeList") {
        apiElements.push(node);
      }
    });
    if (apiElements.length === 0) return;

    const [directory, versionDir] = path.relative(siteDir, file.path).split(path.sep);
    const version = directory === "current_docs"
      ? "current"
      : directory === "versioned_docs"
        ? versions.find((name) => versionDir === `version-${name}`)
        : undefined;
    if (!version) {
      throw new Error(`Cannot select a Dagger API schema for ${file.path}`);
    }

    tree.children.unshift(modelImport(version));
    for (const node of apiElements) {
      node.attributes.push({
        type: "mdxJsxAttribute",
        name: "model",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: modelName,
          data: {
            estree: {
              type: "Program",
              sourceType: "module",
              body: [{
                type: "ExpressionStatement",
                expression: { type: "Identifier", name: modelName },
              }],
            },
          },
        },
      });
    }
  };
}

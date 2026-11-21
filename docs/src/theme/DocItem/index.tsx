import React from "react";
import DocItem from "@theme-original/DocItem";
import type { Props } from "@theme/DocItem";
import { ApiModelContext } from "@site/src/components/api/data";
import type { ApiModel } from "@site/src/components/api/data";

type ApiDocProps = Props & {
  content: Props["content"] & { daggerApiModel?: ApiModel };
};

export default function DocItemWithApiModel(props: ApiDocProps): JSX.Element {
  return (
    <ApiModelContext.Provider value={props.content.daggerApiModel ?? null}>
      <DocItem {...props} />
    </ApiModelContext.Provider>
  );
}

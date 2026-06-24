import { BaseContainer } from "./BaseContainer.js";
import { ArrayContainer } from "./ArrayContainer.js";
import { SingleLinkContainer } from "./SingleLinkContainer.js";
import { DoubleLinkContainer } from "./DoubleLinkContainer.js";
import { HashMapContainer } from "./HashMapContainer.js";
import { BSTContainer } from "./BSTContainer.js";
import { RBTreeContainer } from "./RBTreeContainer.js";
import { TrieContainer } from "./TrieContainer.js";
import { SkipListContainer } from "./SkipListContainer.js";
import { GraphContainer } from "./GraphContainer.js";

export function createContainerRenderer(core, tableRender, fieldTag) {
  const map = {
    array: ArrayContainer,
    single_link: SingleLinkContainer,
    double_link: DoubleLinkContainer,
    hashmap: HashMapContainer,
    bst: BSTContainer,
    rbtree: RBTreeContainer,
    trie: TrieContainer,
    skip_list: SkipListContainer,
    graph: GraphContainer
  };
  const Cls = map[fieldTag.containerType];
  if (!Cls) throw new Error(`未注册容器类型:${fieldTag.containerType}`);
  return new Cls(core, tableRender, fieldTag);
}
interface Registry {
  callbacks: WeakMap<Node, Set<() => void>>;
  observer: MutationObserver;
  count: number;
}
const documents = new WeakMap<Document, Registry>();

/** One removal observer per document; visits removed subtrees, never every registered trigger. */
export function trackRemoval(node: HTMLElement, cleanup: () => void): () => void {
  const doc = node.ownerDocument;
  let registry = documents.get(doc);
  if (!registry) {
    const callbacks = new WeakMap<Node, Set<() => void>>();
    const observer = new doc.defaultView!.MutationObserver((records) => {
      for (const record of records)
        for (const removed of record.removedNodes) {
          if (removed.isConnected || removed.nodeType !== 1) continue;
          const walker = doc.createTreeWalker(removed, 1);
          do {
            callbacks.get(walker.currentNode)?.forEach((remove) => remove());
          } while (walker.nextNode());
        }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    registry = { callbacks, observer, count: 0 };
    documents.set(doc, registry);
  }
  let callbacks = registry.callbacks.get(node);
  if (!callbacks) registry.callbacks.set(node, (callbacks = new Set()));
  callbacks.add(cleanup);
  registry.count++;
  return () => {
    if (!callbacks.delete(cleanup)) return;
    if (!--registry.count) {
      registry.observer.disconnect();
      documents.delete(doc);
    }
  };
}

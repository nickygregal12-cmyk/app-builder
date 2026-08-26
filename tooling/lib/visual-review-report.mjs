export function captureInventory(evidence) {
  return (evidence?.captures ?? []).map((capture) => ({
    id: capture.id,
    pageId: capture.pageId,
    route: capture.route,
    viewport: capture.viewport,
    state: { ...capture.state },
    file: capture.file,
    contentHash: capture.contentHash,
    byteSize: capture.byteSize,
    elementRefs: [...capture.elementRefs],
  }));
}

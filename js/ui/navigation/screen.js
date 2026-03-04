import { LocalStore } from "../../core/storage/localStore.js";

const STRICT_DPAD_GRID_KEY = "strictDpadGridNavigation";

function shouldUseStrictDpadGrid() {
  return Boolean(LocalStore.get(STRICT_DPAD_GRID_KEY, true));
}

export const ScreenUtils = {

  show(container) {
    if (!container) {
      return;
    }
    container.style.display = "block";
  },

  hide(container) {
    if (!container) {
      return;
    }
    container.style.display = "none";
    container.innerHTML = "";
  },

  setInitialFocus(container, selector = ".focusable") {
    const first = container?.querySelector(selector);
    if (!first) {
      return;
    }
    first.classList.add("focused");
    first.focus({ preventScroll: true });
  },

  moveFocus(container, direction, selector = ".focusable") {
    const list = Array.from(container?.querySelectorAll(selector) || []);
    const current = container?.querySelector(`${selector}.focused`);
    if (!list.length || !current) {
      return;
    }

    const index = Number(current.dataset.index || 0);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= list.length) {
      return;
    }

    current.classList.remove("focused");
    list[nextIndex].classList.add("focused");
    list[nextIndex].focus();
  },

  moveFocusDirectional(container, direction, selector = ".focusable") {
    // PERF: read all rects in one batch to minimize forced reflows
    const list = Array.from(container?.querySelectorAll(selector) || [])
      .filter((node) => {
        const s = node.style;
        return !s.display || s.display !== "none";
      });
    if (!list.length) {
      return;
    }

    const current = container?.querySelector(`${selector}.focused`) || list[0];
    if (!current.classList.contains("focused")) {
      list.forEach((node) => node.classList.remove("focused"));
      current.classList.add("focused");
      current.focus({ preventScroll: true });
      return;
    }

    // Batch all getBoundingClientRect calls together (one layout pass)
    const rects = list.map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);

    const currentEntry = rects.find(({ node }) => node === current);
    if (!currentEntry) return;

    const { rect: currentRect } = currentEntry;
    const cx = currentRect.left + currentRect.width / 2;
    const cy = currentRect.top + currentRect.height / 2;
    const strictDpadGrid = shouldUseStrictDpadGrid();

    const candidates = rects
      .filter(({ node }) => node !== current)
      .map(({ node, rect }) => {
        const nx = rect.left + rect.width / 2;
        const ny = rect.top + rect.height / 2;
        const dx = nx - cx;
        const dy = ny - cy;
        return { node, rect, dx, dy };
      })
      .filter(({ dx, dy }) => {
        if (direction === "up") return dy < -2;
        if (direction === "down") return dy > 2;
        if (direction === "left") return dx < -2;
        if (direction === "right") return dx > 2;
        return false;
      })
      .map((entry) => {
        const primary = (direction === "up" || direction === "down")
          ? Math.abs(entry.dy)
          : Math.abs(entry.dx);
        const secondary = (direction === "up" || direction === "down")
          ? Math.abs(entry.dx)
          : Math.abs(entry.dy);
        const axisTolerance = (direction === "up" || direction === "down")
          ? Math.max(currentRect.width * 0.7, entry.rect.width * 0.7, 48)
          : Math.max(currentRect.height * 0.7, entry.rect.height * 0.7, 48);
        const aligned = secondary <= axisTolerance;
        return { ...entry, aligned, score: primary * 1000 + secondary };
      });

    let target = null;

    if (direction === "up" || direction === "down") {
      if (strictDpadGrid) {
        const nearestPrimary = candidates.reduce((min, e) => Math.min(min, Math.abs(e.dy)), Number.POSITIVE_INFINITY);
        const rowTolerance = Math.max(currentRect.height * 0.9, 42);
        const nearestRow = candidates.filter((e) => Math.abs(e.dy) <= nearestPrimary + rowTolerance);
        const alignedInRow = nearestRow.filter((e) => e.aligned).sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx));
        const rowSorted = nearestRow.sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx) || Math.abs(a.dy) - Math.abs(b.dy));
        target = alignedInRow[0]?.node || rowSorted[0]?.node || null;
      } else {
        const aligned = candidates.filter((e) => e.aligned).sort((a, b) => a.score - b.score);
        const sorted = candidates.sort((a, b) => a.score - b.score);
        target = aligned[0]?.node || sorted[0]?.node || null;
      }
    } else {
      if (strictDpadGrid) {
        const nearestPrimary = candidates.reduce((min, e) => Math.min(min, Math.abs(e.dx)), Number.POSITIVE_INFINITY);
        const colTolerance = Math.max(currentRect.width * 0.9, 42);
        const nearestCol = candidates.filter((e) => Math.abs(e.dx) <= nearestPrimary + colTolerance);
        const alignedInCol = nearestCol.filter((e) => e.aligned).sort((a, b) => Math.abs(a.dy) - Math.abs(b.dy));
        const colSorted = nearestCol.sort((a, b) => Math.abs(a.dy) - Math.abs(b.dy) || Math.abs(a.dx) - Math.abs(b.dx));
        target = alignedInCol[0]?.node || colSorted[0]?.node || null;
      } else {
        const aligned = candidates.filter((e) => e.aligned).sort((a, b) => a.score - b.score);
        const sorted = candidates.sort((a, b) => a.score - b.score);
        target = aligned[0]?.node || sorted[0]?.node || null;
      }
    }

    if (!target) return;

    current.classList.remove("focused");
    target.classList.add("focused");
    target.focus({ preventScroll: true });
  },

  handleDpadNavigation(event, container, selector = ".focusable") {
    const code = Number(event?.keyCode || 0);
    const direction = code === 38 ? "up"
      : code === 40 ? "down"
        : code === 37 ? "left"
          : code === 39 ? "right"
            : null;
    if (!direction) {
      return false;
    }
    if (typeof event?.preventDefault === "function") {
      event.preventDefault();
    }
    this.moveFocusDirectional(container, direction, selector);
    return true;
  },

  indexFocusables(container, selector = ".focusable") {
    const list = Array.from(container?.querySelectorAll(selector) || []);
    list.forEach((node, index) => {
      node.dataset.index = String(index);
      node.tabIndex = 0;
    });
  }

};

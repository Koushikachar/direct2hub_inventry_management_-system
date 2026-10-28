"use client";
import { useEffect, useRef } from "react";
let leaving = false, leavingTimer: ReturnType<typeof setTimeout> | undefined;
/** Call right before a sheet/dialog closes because the person is navigating somewhere (a link or result was chosen). The link must use `replace`, so the destination
 *  takes over the entry the open layer added. Without this, closing would call history.back() and undo the navigation, which is why sheet links "did nothing". */
export function leaveLayer() { leaving = true; clearTimeout(leavingTimer); leavingTimer = setTimeout(() => { leaving = false; }, 1500); }
/** While a sheet or dialog is open, the Back button/gesture closes it instead of leaving the page. This is the web version of Android's predictive back:
 *  opening adds a history entry, Back removes it (and our close runs), and closing by tapping removes the entry again so history stays clean. */
export function useBackClose(open: boolean, close: () => void) {
  const pushed = useRef(false), closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    history.pushState({ d2hLayer: true }, ""); pushed.current = true;
    const onPop = () => { if (pushed.current) { pushed.current = false; closeRef.current(); } };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!pushed.current) return; pushed.current = false;
      if (leaving) { leaving = false; return; } // navigating: the replace-link takes over this entry
      if (history.state?.d2hLayer) history.back();
    };
  }, [open]);
}

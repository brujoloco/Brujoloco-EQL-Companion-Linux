// feedbackApi.ts — the slice of the bridge that is about GETTING A REPORT OUT OF A DARK BUILD.
//
// A separate file for FILE MASS, not for scope — the questsApi.ts/craftApi.ts pattern and the rule
// those files state: `src/preload/index.ts` sits at the measured 400-code-line ceiling and the
// answer is to SPLIT rather than to ratchet. This object is spread into the bridge, so the method
// below is an ordinary member of the one `window.eq` surface and no call site knows where it was
// defined.
//
// The other feedback methods stay in index.ts beside the rest of the dialog's calls; only the new
// one lands here, because moving working lines would be a diff about nothing.


export const feedbackApi = {
}

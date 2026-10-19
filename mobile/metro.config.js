// metro.config.js — the bundler, plus the ONE seam that makes this app share the desktop's wire.
//
// ── THE SHARED PROTOCOL IS IMPORTED, NOT COPIED (docs/plans/phone-native.md, section 2) ────────
//
// `@shared/phone/types` and `@shared/phone/limits` resolve to `../src/shared/phone/*` — the same
// files `src/main/phone/desk.ts` and `share-server/src/phoneRoom.ts` import. There is one channel
// table, one event-kind table, one frame shape and one set of bounds in this repository, and this
// is how a React Native bundle reads them.
//
// TWO PIECES, both required and neither sufficient alone:
//
//   watchFolders — Metro refuses to serve a file outside the project root unless the root that
//                  contains it is watched. The repo root is added; `node_modules` resolution still
//                  starts here, so the desktop's 600-package tree is NOT on this app's path.
//   resolveRequest — the alias itself. `resolver.alias` exists in newer Metro but its behaviour
//                  across SDK lines is not something to bet a build on; `resolveRequest` is the
//                  documented, stable hook and it is four lines.
//
// This was tried before any vendoring was considered, and it works — `npx expo export` bundles it.
// So there is no sync script and no drift test in this app, because there is no copy to drift.

const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '..')

/** `@shared/x/y` → `<repo>/src/shared/x/y`. The only prefix this app is allowed to reach out with. */
const SHARED_PREFIX = '@shared/'

const config = getDefaultConfig(projectRoot)

config.watchFolders = [repoRoot]

// NOTHING ELSE IS OVERRIDDEN, and `nodeModulesPaths` / `disableHierarchicalLookup` were TRIED AND
// REMOVED. Pinning resolution to this project's own `node_modules` looks like the right isolation
// for a folder that sits beside a 600-package desktop tree — but it also switches off the walk
// into `node_modules/<pkg>/node_modules`, which npm really does populate here (@babel/core,
// @react-native/codegen and a dozen more), and `npx expo-doctor` flags it for exactly that reason.
// It is not needed anyway: the only two files reached through the alias below import nothing at
// all outside themselves, so there is no resolution to leak in the first place.

const defaultResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(SHARED_PREFIX)) {
    const target = path.resolve(repoRoot, 'src', 'shared', moduleName.slice(SHARED_PREFIX.length))
    return context.resolveRequest(context, `${target}.ts`, platform)
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config

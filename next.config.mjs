/** @type {import('next').NextConfig} */
const config = {
  // Unlike proxyma-landing, this is NOT a static export: the app needs a Node runtime for the
  // extraction API route and for auth. `standalone` emits .next/standalone with only the
  // dependencies actually reached, which is what deploy/Dockerfile copies into the runtime
  // image - the alternative is shipping node_modules, which is an order of magnitude larger.
  output: 'standalone',

  // Both ship prebuilt native .node binaries, which webpack cannot bundle - it tries to parse
  // them as JavaScript and fails the build. Listing them here keeps them as runtime requires,
  // and Next's file tracing still copies them into .next/standalone.
  serverExternalPackages: ['@napi-rs/canvas', 'onnxruntime-node'],
}
export default config

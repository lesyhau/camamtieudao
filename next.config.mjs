/** @type {import('next').NextConfig} */
const config = {
  // Unlike proxyma-landing, this is NOT a static export: the app needs a Node runtime for the
  // extraction API route and for auth. `standalone` emits .next/standalone with only the
  // dependencies actually reached, which is what deploy/Dockerfile copies into the runtime
  // image - the alternative is shipping node_modules, which is an order of magnitude larger.
  output: 'standalone',
}
export default config

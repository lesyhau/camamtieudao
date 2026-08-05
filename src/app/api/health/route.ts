// Liveness for install.sh, the compose healthcheck and the deploy verification step.
// Deliberately unauthenticated and free of side effects: it answers "this process is up and
// routing", nothing more. It must never touch the model - a health check that spends credits
// is one that gets disabled.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}

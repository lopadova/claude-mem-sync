import type { ParsedArgs } from "../cli";
import { startDashboardServer } from "../core/dashboard-server";

export default async function run(args: ParsedArgs): Promise<void> {
  const port = args.port ?? 3737;
  await startDashboardServer(port);
}

// Forks can deploy manual research on Hobby. Enable this flag on Pro when
// installing the minutely dispatcher; users still opt in to their own budgets.
const monitoring = process.env.TREG_VERCEL_MONITORING === "1";
export const config = {
  framework: "nextjs",
  regions: ["iad1"],
  buildCommand: "npm run db:migrate && npm run build",
  crons: monitoring ? [{ path: "/api/cron/monitor", schedule: "* * * * *" }] : [],
  ...(monitoring ? { functions: { "src/app/api/cron/monitor/route.ts": { maxDuration: 360 } } } : {}),
};

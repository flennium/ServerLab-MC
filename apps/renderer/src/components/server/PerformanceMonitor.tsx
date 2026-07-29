import { useStatsStore } from "../../store/statsStore.js";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PerformanceMonitorProps {
  serverId: string;
  ramMaxMb: number;
}

export function PerformanceMonitor({ serverId, ramMaxMb }: PerformanceMonitorProps) {
  const { getStats } = useStatsStore();
  const stats = getStats(serverId);
  const { latest } = stats;

  if (!latest) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-5 text-center text-sm text-muted">
        Waiting for server stats… (server must be running)
      </div>
    );
  }

  // Build chart data array from history
  const chartData = stats.cpu.map((cpu, i) => ({
    cpu,
    ramMb: stats.ramMb[i] ?? 0,
    tps: stats.tps[i] ?? 20,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="CPU"
          value={`${latest.cpu}%`}
          color={latest.cpu > 80 ? "text-danger" : "text-accent"}
        />
        <KpiCard
          label="RAM"
          value={`${latest.ramMb} MB`}
          sub={`/ ${ramMaxMb} MB`}
          color={
            latest.ramMb / ramMaxMb > 0.9 ? "text-danger" : "text-white"
          }
        />
        <KpiCard
          label="TPS"
          value={latest.tps.toFixed(2)}
          color={latest.tps < 18 ? "text-warning" : "text-accent"}
        />
        <KpiCard
          label="Players"
          value={String(latest.players)}
          color="text-white"
        />
      </div>

      {/* CPU chart */}
      <ChartCard title="CPU %">
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis hide />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: "#1e1e1e", border: "1px solid #2e2e2e", fontSize: 11 }}
              formatter={(v) => [`${v}%`, "CPU"]}
            />
            <Area
              type="monotone"
              dataKey="cpu"
              stroke="#22c55e"
              fill="url(#cpuGrad)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* RAM chart */}
      <ChartCard title="RAM (MB)">
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5555FF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5555FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis hide />
            <YAxis domain={[0, ramMaxMb]} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: "#1e1e1e", border: "1px solid #2e2e2e", fontSize: 11 }}
              formatter={(v) => [`${v} MB`, "RAM"]}
            />
            <Area
              type="monotone"
              dataKey="ramMb"
              stroke="#5555FF"
              fill="url(#ramGrad)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* TPS chart */}
      <ChartCard title="TPS">
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="tpsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FFAA00" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FFAA00" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis hide />
            <YAxis domain={[0, 20]} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: "#1e1e1e", border: "1px solid #2e2e2e", fontSize: 11 }}
              formatter={(v) => [typeof v === "number" ? v.toFixed(2) : v, "TPS"]}
            />
            <Area
              type="monotone"
              dataKey="tps"
              stroke="#FFAA00"
              fill="url(#tpsGrad)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${color}`}>
        {value}
        {sub && <span className="ml-1 text-sm font-normal text-muted">{sub}</span>}
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 pt-3 pb-2">
      <p className="mb-2 text-xs font-medium text-muted">{title}</p>
      {children}
    </div>
  );
}

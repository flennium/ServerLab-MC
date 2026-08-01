import { Activity, Gauge } from "lucide-react";
import { useStatsStore } from "../../store/statsStore.js";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, EmptyState, StatTile } from "../ui/Layout.js";

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
      <EmptyState
        icon={<Activity className="h-10 w-10" aria-hidden="true" />}
        title="Waiting for live stats"
        description="Start the server to stream CPU, RAM, TPS, and player counts into this monitor."
      />
    );
  }

  const chartData = stats.cpu.map((cpu, index) => ({
    cpu,
    ramMb: stats.ramMb[index] ?? 0,
    tps: stats.tps[index] ?? 20,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="CPU"
          value={`${latest.cpu}%`}
          tone={latest.cpu > 80 ? "danger" : "good"}
        />
        <StatTile
          label="RAM"
          value={`${latest.ramMb}`}
          detail={`/ ${ramMaxMb} MB`}
          tone={latest.ramMb / ramMaxMb > 0.9 ? "danger" : "info"}
        />
        <StatTile
          label="TPS"
          value={latest.tps.toFixed(2)}
          tone={latest.tps < 18 ? "warn" : "good"}
        />
        <StatTile label="Players" value={latest.players} tone="neutral" />
      </div>

      <ChartCard title="CPU load" color="#4CAF50" dataKey="cpu" domain={[0, 100]} suffix="%" data={chartData} />
      <ChartCard
        title="Memory allocation"
        color="#4D7CFE"
        dataKey="ramMb"
        domain={[0, ramMaxMb]}
        suffix=" MB"
        data={chartData}
      />
      <ChartCard title="Server TPS" color="#F6C85F" dataKey="tps" domain={[0, 20]} suffix="" data={chartData} />
    </div>
  );
}

function ChartCard({
  title,
  color,
  dataKey,
  domain,
  suffix,
  data,
}: {
  title: string;
  color: string;
  dataKey: "cpu" | "ramMb" | "tps";
  domain: [number, number];
  suffix: string;
  data: Array<{ cpu: number; ramMb: number; tps: number }>;
}) {
  const gradientId = `${dataKey}Gradient`;

  return (
    <Card className="px-4 pb-3 pt-3">
      <div className="mb-2 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-copper" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</p>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis hide />
          <YAxis domain={domain} tick={{ fontSize: 10, fill: "#8B949E" }} stroke="#303741" />
          <Tooltip
            contentStyle={{
              background: "#171A1E",
              border: "1px solid #303741",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(value) => [`${value}${suffix}`, title]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

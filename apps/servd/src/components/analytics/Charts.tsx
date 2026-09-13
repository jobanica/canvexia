"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MANGO = "#FF7A1A";
const GUAVA = "#FF4D6D";
const PIE_COLORS = ["#FF7A1A", "#FF4D6D", "#FF9A2E", "#A9959F"];

const peso = (centavos: number) => `₱${(centavos / 100).toFixed(0)}`;

export function RevenueChart({ data }: { data: { day: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MANGO} stopOpacity={0.5} />
            <stop offset="100%" stopColor={MANGO} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => peso(Number(v))} tick={{ fontSize: 11 }} width={56} />
        <Tooltip formatter={(v) => peso(Number(v))} />
        <Area type="monotone" dataKey="revenue" stroke={MANGO} fill="url(#rev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RatingTrendChart({ data }: { data: { day: string; avg: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} width={28} />
        <Tooltip formatter={(v) => `${Number(v).toFixed(2)} ★`} />
        <Line type="monotone" dataKey="avg" stroke={GUAVA} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PeakHoursChart({ data }: { data: { hour: number; orders: number }[] }) {
  // Fill all 24 hours so the axis is continuous.
  const byHour = new Map(data.map((d) => [d.hour, d.orders]));
  const full = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}:00`,
    orders: byHour.get(h) ?? 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={full} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
        <Tooltip />
        <Bar dataKey="orders" fill={MANGO} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentMixChart({
  data,
}: {
  data: { method: string; amount: number }[];
}) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-plum-ink/40">No payments yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          nameKey="method"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={(e) => e.method}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => peso(Number(v))} />
      </PieChart>
    </ResponsiveContainer>
  );
}

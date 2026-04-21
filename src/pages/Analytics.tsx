import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import PageHeader from '../components/PageHeader';
import EntityLink from '../components/EntityLink';
import { useWindowSize } from '../hooks/useWindowSize';
import { useAnalyticsCharts } from '../hooks/useAnalyticsCharts';

const COLORS = ['#3d7a5a', '#2563eb', '#d97706', '#7c3aed', '#16a34a', '#dc2626', '#0891b2'];

export default function Analytics() {
  const { isMobile } = useWindowSize();
  
  const {
    loading,
    cached,
    organiserNames,
    categoryData,
    modeData,
    publishData,
    paidData,
    eventsOverTime,
    revenueOverTime,
    revByCategory,
    geoPoints,
    organiserData,
  } = useAnalyticsCharts();

  const colHalf = isMobile ? '1fr' : '1fr 1fr';
  const colFull = '1fr';
  const sampleNote = cached
    ? 'Cached sample of up to 200 events and 200 payments (refreshes every 10 min).'
    : 'Showing analysis for up to 200 events and 200 payments.';

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={sampleNote}
      />

      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Loading analytics...</p>
      ) : (
        <>
          {/* Row 1: Events over time + Revenue over time */}
          <div style={{ display: 'grid', gridTemplateColumns: colFull, gap: 16, marginBottom: 16 }}>
            <ChartCard title="Events Created — Last 12 Months">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={eventsOverTime} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="evGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3d7a5a" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3d7a5a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  <Area type="monotone" dataKey="count" stroke="#3d7a5a" strokeWidth={2} fill="url(#evGrad)" name="Events" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: colFull, gap: 16, marginBottom: 16 }}>
            <ChartCard title="Revenue — Last 12 Months (Completed Payments)">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={revenueOverTime} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => [`$${Number(v)}`, 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 2: Donut charts */}
          <div style={{ display: 'grid', gridTemplateColumns: colHalf, gap: 16, marginBottom: 16 }}>
            <ChartCard title="Published vs Draft">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={publishData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {publishData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Legend iconType="circle" iconSize={10} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Paid vs Free Events">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={paidData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {paidData.map((_, i) => <Cell key={i} fill={COLORS[i + 2]} />)}
                  </Pie>
                  <Legend iconType="circle" iconSize={10} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 3: Category bars + revenue bars */}
          <div style={{ display: 'grid', gridTemplateColumns: colHalf, gap: 16, marginBottom: 16 }}>
            <ChartCard title="Events by Category">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Events">
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Revenue by Category">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revByCategory} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip formatter={(v) => [`$${Number(v)}`, 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} name="Revenue">
                    {revByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Mode breakdown + Organiser leaderboard */}
          <div style={{ display: 'grid', gridTemplateColumns: colHalf, gap: 16, marginBottom: 16 }}>
            <ChartCard title="Events by Mode">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={modeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Events">
                    {modeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top Organisers (by events created)">
              <div style={{ overflowY: 'auto', maxHeight: 200 }}>
                {organiserData.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 20 }}>No data</p>
                ) : organiserData.map((row, i) => (
                  <div key={row.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                    <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: i < 3 ? '#d97706' : '#9ca3af', textAlign: 'center' }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: COLORS[i % COLORS.length], borderRadius: 3, width: `${Math.round((row.total / (organiserData[0]?.total ?? 1)) * 100)}%`, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', minWidth: 28, textAlign: 'right' }}>{row.total}</span>
                    <div style={{ fontSize: 12, fontWeight: 500, maxWidth: 110 }}>
                      <EntityLink
                        kind="user"
                        id={row.uid}
                        label={organiserNames[row.uid] ?? '…'}
                        ellipsis
                        strong
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Event Geo Map */}
          {geoPoints.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <ChartCard title={`Event Locations — ${geoPoints.length} events with geo data`}>
                <div style={{ height: 380, borderRadius: 8, overflow: 'hidden', marginTop: 4 }}>
                  <MapContainer
                    center={[geoPoints[0].lat, geoPoints[0].lng]}
                    zoom={5}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {geoPoints.map((pt, i) => (
                      <CircleMarker
                        key={i}
                        center={[pt.lat, pt.lng]}
                        radius={8}
                        pathOptions={{
                          fillColor: pt.published ? '#3d7a5a' : '#d97706',
                          color: '#fff',
                          weight: 1.5,
                          fillOpacity: 0.85,
                        }}
                      >
                        <Popup>
                          <EntityLink kind="event" id={pt.id} label={pt.name} strong />
                          <br />
                          {pt.published ? '✅ Published' : '📝 Draft'}
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
                <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                  Green = published · Orange = draft · Click a dot for event name
                </p>
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '18px 20px',
      minWidth: 0,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 14 }}>{title}</h2>
      {children}
    </div>
  );
}

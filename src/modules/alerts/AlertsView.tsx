import React, { useEffect, useState } from 'react';
import { Bell, Plus, Trash2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useViewAs } from '../../hooks/useViewAs';
import { fetchAlertThresholds, createAlertThreshold, deleteAlertThreshold, AlertThreshold } from '../../services/atlasApi';
import { Navigate } from 'react-router-dom';

export function AlertsView() {
  const { agencyId } = useAuthStore();
  const { viewAsAgency } = useViewAs();
  const tenantAgencyId = agencyId || viewAsAgency?.slug;

  const [thresholds, setThresholds] = useState<AlertThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [targetType, setTargetType] = useState<'network' | 'route' | 'stop'>('network');
  const [targetId, setTargetId] = useState('');
  const [metric, setMetric] = useState<'bunching_pct' | 'delay_seconds' | 'match_rate' | 'ghost_pct'>('bunching_pct');
  const [comparison, setComparison] = useState<'>' | '<' | '=='>('>');
  const [value, setValue] = useState('');
  const [cooldown, setCooldown] = useState('60');
  const [notionEnabled, setNotionEnabled] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!tenantAgencyId) return;
    loadThresholds();
  }, [tenantAgencyId]);

  const loadThresholds = async () => {
    setLoading(true);
    try {
      const data = await fetchAlertThresholds();
      setThresholds(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) return;

    setCreating(true);
    try {
      await createAlertThreshold({
        target_type: targetType,
        target_id: targetType !== 'network' ? targetId : null,
        metric,
        comparison,
        value: Number(value),
        cooldown_minutes: Number(cooldown),
        notion_enabled: notionEnabled
      });
      await loadThresholds();
      // Reset form briefly
      setValue('');
      setTargetId('');
    } catch (err: any) {
      alert(`Failed to create alert: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAlertThreshold(id);
      setThresholds(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      alert(`Failed to delete alert: ${err.message}`);
    }
  };

  if (!tenantAgencyId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-4 md:px-8 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--fg)] flex items-center gap-3">
            <Bell className="w-8 h-8 text-indigo-400" />
            Alerts & Thresholds
          </h1>
          <p className="text-[var(--text-muted)] mt-2 max-w-2xl text-[13px] leading-relaxed">
            Configure system-wide or route-specific performance thresholds. When these thresholds are breached, 
            Atlas will generate an incident record.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create Form */}
        <div className="md:col-span-1 border border-[var(--border)] rounded-xl bg-[var(--item-bg)] overflow-hidden flex flex-col h-fit">
          <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg)]/50">
            <h3 className="text-[13px] font-bold text-[var(--fg)] flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" />
              New Rule
            </h3>
          </div>
          <form onSubmit={handleCreate} className="p-5 space-y-4">
            <div className="space-y-2.5">
              <label className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">Target Scope</label>
              <select 
                value={targetType} 
                onChange={e => setTargetType(e.target.value as any)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded p-2 text-sm text-[var(--fg)]"
              >
                <option value="network">Entire Network</option>
                <option value="route">Specific Route</option>
                <option value="stop">Specific Stop</option>
              </select>
            </div>

            {targetType !== 'network' && (
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">Target ID</label>
                <input 
                  type="text" 
                  value={targetId}
                  onChange={e => setTargetId(e.target.value)}
                  placeholder={targetType === 'route' ? 'e.g. 504' : 'e.g. 14592'}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded p-2 text-sm text-[var(--fg)] placeholder:text-[var(--text-muted)]/50"
                  required
                />
              </div>
            )}

            <div className="space-y-2.5">
              <label className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">Metric & Condition</label>
              <div className="flex items-center gap-2">
                <select 
                  value={metric} 
                  onChange={e => setMetric(e.target.value as any)}
                  className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded p-2 text-sm text-[var(--fg)]"
                >
                  <option value="bunching_pct">Bunching %</option>
                  <option value="delay_seconds">Delay (Seconds)</option>
                  <option value="ghost_pct">Ghost Bus %</option>
                  <option value="match_rate">Match Rate %</option>
                </select>
                <select 
                  value={comparison} 
                  onChange={e => setComparison(e.target.value as any)}
                  className="w-16 bg-[var(--bg)] border border-[var(--border)] rounded p-2 text-sm text-[var(--fg)] px-1"
                >
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value="==">==</option>
                </select>
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">Threshold Value</label>
              <input 
                type="number" 
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="e.g. 15"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded p-2 text-sm text-[var(--fg)] placeholder:text-[var(--text-muted)]/50"
                required
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">Cooldown (Mins)</label>
              <input 
                type="number" 
                value={cooldown}
                onChange={e => setCooldown(e.target.value)}
                min="0"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded p-2 text-sm text-[var(--fg)]"
                required
              />
            </div>

            <div className="pt-2">
               <label className="flex items-center gap-2 cursor-pointer">
                 <input 
                    type="checkbox" 
                    checked={notionEnabled}
                    onChange={e => setNotionEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg)] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                  />
                  <span className="text-sm font-medium text-[var(--fg)]">Sync to Notion Log</span>
               </label>
            </div>

            <button 
              type="submit" 
              disabled={creating}
              className="w-full mt-4 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold text-sm py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {creating ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Create Rule'}
            </button>
          </form>
        </div>

        {/* Rules List */}
        <div className="md:col-span-2 border border-[var(--border)] rounded-xl bg-[var(--item-bg)] flex flex-col h-[600px]">
          <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)]/50">
             <h3 className="text-[13px] font-bold text-[var(--fg)] flex items-center gap-2">
               <ShieldAlert className="w-4 h-4 text-emerald-400" />
               Active Rules
             </h3>
             <span className="text-[11px] text-[var(--text-muted)]">{thresholds.length} configured</span>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
             {loading ? (
               <div className="flex items-center justify-center h-full">
                 <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
               </div>
             ) : error ? (
                <div className="flex items-center gap-2 text-red-500 text-sm justify-center h-full"><AlertTriangle className="w-4 h-4" /> {error}</div>
             ) : thresholds.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-3">
                   <Bell className="w-12 h-12 opacity-20" />
                   <p className="text-sm font-medium">No alert rules configured.</p>
                </div>
             ) : (
                <div className="space-y-3">
                   {thresholds.map(t => (
                      <div key={t.id} className="precision-panel p-4 flex items-center justify-between group">
                         <div>
                            <div className="flex items-center gap-2 mb-1">
                               <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                                 {t.target_type}
                               </span>
                               {t.target_id && <span className="text-xs font-bold atlas-mono text-[var(--fg)]">{t.target_id}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] mt-1.5">
                               IF <span className="text-[var(--fg)]">{t.metric}</span> 
                               <span className="text-emerald-400 font-bold atlas-mono mx-1">{t.comparison}</span>
                               <span className="text-[var(--fg)] font-black atlas-mono">{t.value}</span>
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-2 flex items-center gap-3">
                               <span>Cooldown: {t.cooldown_minutes}m</span>
                               {t.notion_enabled && <span className="text-blue-400">Notion Sync</span>}
                            </div>
                         </div>
                         <button 
                           onClick={() => handleDelete(t.id)}
                           className="p-2 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                   ))}
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

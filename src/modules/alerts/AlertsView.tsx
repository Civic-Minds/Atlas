import React, { useEffect, useState } from 'react';
import { Bell, Plus, Trash2, AlertTriangle, ShieldAlert, History, Settings2 } from 'lucide-react';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useViewAs } from '../../hooks/useViewAs';
import { fetchAlertThresholds, createAlertThreshold, deleteAlertThreshold, AlertThreshold } from '../../services/atlasApi';
import { ModuleSubNav } from '../../components/ModuleSubNav';
import { ModuleIntro } from '../../components/ModuleIntro';

type TabId = 'thresholds' | 'history';

export function AlertsView() {
  const { agencyId, role } = useAuthStore();
  const { viewAsAgency } = useViewAs();
  const isAdmin = role === 'admin' || role === 'researcher';
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
  const [tab, setTab] = useState<TabId>('thresholds');

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
    return (
      <div className="max-w-5xl mx-auto w-full px-4 md:px-8 py-8">
        <h1 className="text-3xl font-black tracking-tight text-[var(--fg)] flex items-center gap-3 mb-4">
          <Bell className="w-8 h-8 text-indigo-400" />
          Alerts & Thresholds
        </h1>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center border border-[var(--border)] rounded-xl bg-[var(--item-bg)]">
          <Bell className="w-10 h-10 text-[var(--text-muted)] opacity-20" />
          <p className="text-[14px] font-bold text-[var(--fg)]">No agency selected</p>
          <p className="text-[12px] text-[var(--text-muted)] max-w-xs">
            {isAdmin
              ? 'Use the Agency button in the top navigation to select an agency, then configure its alert rules here.'
              : 'Your account is not linked to an agency. Contact your administrator.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-container">
      <ModuleIntro
        subtitle="Define alert rules for bunching, delay, ghost service, and matching failures."
      />

      <ModuleSubNav<TabId>
        tabs={[
          { id: 'thresholds', label: 'Thresholds', icon: Settings2 },
          { id: 'history', label: 'Incident Log', icon: History }
        ]}
        activeTab={tab}
        onTabChange={setTab}
      />

      <div className="mb-4 text-[12px] text-[var(--text-muted)]">
        {tab === 'thresholds' && 'Create performance rules that flag bunching, delay, ghost buses, and data integrity problems.'}
        {tab === 'history' && 'Review triggered incidents and alert activity for the current agency.'}
      </div>

      <div className="mt-2">
        {tab === 'thresholds' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Create Form */}
            <div className="md:col-span-1 precision-panel h-fit overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--item-bg)]">
                <h3 className="atlas-label flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  Define Performance Rule
                </h3>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] atlas-label opacity-60">Target Scope</label>
                  <select 
                    value={targetType} 
                    onChange={e => setTargetType(e.target.value as any)}
                    className="w-full bg-[var(--item-bg)] border border-[var(--border)] rounded-xl p-3 text-xs font-bold text-[var(--fg)] appearance-none"
                  >
                    <option value="network">Entire Network</option>
                    <option value="route">Specific Route</option>
                    <option value="stop">Specific Stop</option>
                  </select>
                </div>

                {targetType !== 'network' && (
                  <div className="space-y-2">
                    <label className="text-[9px] atlas-label opacity-60">Target Identifier</label>
                    <input 
                      type="text" 
                      value={targetId}
                      onChange={e => setTargetId(e.target.value)}
                      placeholder={targetType === 'route' ? 'e.g. M15' : 'Stop ID'}
                      className="w-full bg-[var(--item-bg)] border border-[var(--border)] rounded-xl p-3 text-xs font-bold atlas-mono text-[var(--fg)] placeholder:opacity-30"
                      required
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[9px] atlas-label opacity-60">Intelligence Metric</label>
                  <div className="flex items-center gap-2">
                    <select 
                      value={metric} 
                      onChange={e => setMetric(e.target.value as any)}
                      className="flex-1 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl p-3 text-xs font-bold text-[var(--fg)]"
                    >
                      <option value="bunching_pct">Bunching %</option>
                      <option value="delay_seconds">Delay (Seconds)</option>
                      <option value="ghost_pct">Ghost Bus %</option>
                      <option value="match_rate">Match Rate %</option>
                    </select>
                    <select 
                      value={comparison} 
                      onChange={e => setComparison(e.target.value as any)}
                      className="w-16 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl p-3 text-xs font-bold text-emerald-500 atlas-mono"
                    >
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                      <option value="==">==</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] atlas-label opacity-60">Threshold Value</label>
                  <input 
                    type="number" 
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder="Value %"
                    className="w-full bg-[var(--item-bg)] border border-[var(--border)] rounded-xl p-3 text-xs font-bold atlas-mono text-[var(--fg)]"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] atlas-label opacity-60">Cooldown Protocol (Mins)</label>
                  <input 
                    type="number" 
                    value={cooldown}
                    onChange={e => setCooldown(e.target.value)}
                    className="w-full bg-[var(--item-bg)] border border-[var(--border)] rounded-xl p-3 text-xs font-bold atlas-mono text-[var(--fg)]"
                    required
                  />
                </div>

                <div className="flex items-center gap-3 p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                   <input 
                      type="checkbox" 
                      id="notion-sync"
                      checked={notionEnabled}
                      onChange={e => setNotionEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--border)] bg-[var(--item-bg)] text-indigo-500 focus:ring-indigo-500"
                    />
                    <label htmlFor="notion-sync" className="text-xs font-black text-indigo-600 dark:text-indigo-400 cursor-pointer select-none">
                      Sync to Notion Intelligence Log
                    </label>
                </div>

                <button 
                  type="submit" 
                  disabled={creating}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-widest py-4 px-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
                >
                  {creating ? 'Architecting Rule...' : 'Establish Rule'}
                </button>
              </form>
            </div>

            {/* Rules List */}
            <div className="md:col-span-2 precision-panel h-[700px] flex flex-col">
              <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--item-bg)]">
                 <h3 className="atlas-label flex items-center gap-2">
                   <ShieldAlert className="w-3.5 h-3.5 text-emerald-500" />
                   Active Surveillance Meta
                 </h3>
                 <span className="atlas-mono text-[9px] font-black text-[var(--text-muted)]">{thresholds.length} RULES DEPLOYED</span>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                 {loading ? (
                   <div className="flex flex-col items-center justify-center h-full space-y-3">
                     <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                     <p className="atlas-label">Loading registry...</p>
                   </div>
                 ) : error ? (
                    <div className="flex items-center gap-2 text-red-500 text-sm justify-center h-full"><AlertTriangle className="w-4 h-4" /> {error}</div>
                 ) : thresholds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-3 opacity-30">
                       <Bell className="w-16 h-16" />
                       <p className="text-sm font-black uppercase tracking-widest">No active thresholds</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 gap-4">
                       {thresholds.map(t => (
                          <div key={t.id} className="precision-panel p-5 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                             <div>
                                <div className="flex items-center gap-2 mb-2">
                                   <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                                     {t.target_type}
                                   </span>
                                   {t.target_id && <span className="text-xs font-black atlas-mono text-[var(--fg)] tracking-tight">#{t.target_id}</span>}
                                </div>
                                <div className="flex items-center gap-2 text-sm font-bold text-[var(--fg)]">
                                   <span className="text-[var(--text-muted)] font-black italic mr-1">IF</span>
                                   <span className="atlas-label">{t.metric}</span> 
                                   <span className="text-emerald-500 atlas-mono mx-1">{t.comparison}</span>
                                   <span className="atlas-mono font-black border-b-2 border-emerald-500/30">{t.value}</span>
                                </div>
                                <div className="text-[10px] text-[var(--text-muted)] mt-3 flex items-center gap-3 font-bold opacity-60">
                                   <span>COOLDOWN: {t.cooldown_minutes}m</span>
                                   {t.notion_enabled && (
                                     <span className="flex items-center gap-1 text-indigo-500">
                                       <div className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse" />
                                       NOTION ACTIVE
                                     </span>
                                   )}
                                </div>
                             </div>
                             <button 
                               onClick={() => handleDelete(t.id)}
                               className="p-2.5 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-red-500/20"
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
        )}

        {tab === 'history' && (
          <div className="precision-panel py-20 flex flex-col items-center justify-center text-center">
            <History className="w-16 h-16 text-[var(--text-muted)] opacity-20 mb-6" />
            <h3 className="text-xl font-black text-[var(--fg)] mb-2">Incident Forensic Log</h3>
            <p className="text-[var(--text-muted)] text-sm max-w-sm">
              Real-time incident tracking is currently being optimized. All performance breaches are archived in the 
              <span className="font-bold text-indigo-500 mx-1">AtlasLog</span> Notion database.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from './useAuthStore';

export interface Vehicle {
  vehicle_id: string;
  trip_id: string;
  route_id: string;
  lat: number;
  lon: number;
  speed: number;
  bearing: number;
  observed_at: string;
}

export function useVehicleTracking(agencyId: string | null, enabled: boolean) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const user = useAuthStore(state => state.user);

  const fetchVehicles = useCallback(async () => {
    if (!agencyId || !enabled) return;

    try {
      setLoading(true);
      const headers: Record<string, string> = {};
      if (user) {
        const idToken = await user.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }
      const response = await fetch(`/api/vehicles?agency=${agencyId}`, { headers });
      if (!response.ok) throw new Error('Failed to fetch vehicles');
      const data = await response.json();
      setVehicles(data.vehicles || []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching vehicle positions:', err);
    } finally {
      setLoading(false);
    }
  }, [agencyId, enabled]);

  useEffect(() => {
    if (enabled && agencyId) {
      fetchVehicles();
      const interval = setInterval(fetchVehicles, 10000); // 10s refresh
      return () => clearInterval(interval);
    } else {
      setVehicles([]);
    }
  }, [agencyId, enabled, fetchVehicles]);

  return { vehicles, loading, lastUpdate, refresh: fetchVehicles };
}

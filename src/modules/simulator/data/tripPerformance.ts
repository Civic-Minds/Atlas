export interface HourlyPerformance {
  hour: number;
  scheduledTimeSeconds: number;
  actualTimeSeconds: number;
}

export interface RoutePerformance {
  routeId: string;
  data: HourlyPerformance[];
}

// Generates a U-shaped curve with spikes for rush hour (8am and 5pm)
function generatePerformanceData(baselineSeconds: number): HourlyPerformance[] {
  const data: HourlyPerformance[] = [];
  
  for (let hour = 0; hour < 24; hour++) {
    // Scheduled time usually has some padding but stays relatively stable
    // Let's say scheduled is baseline + 15-25%
    const scheduledTime = baselineSeconds * 1.2;
    
    // Actual time follows the peak/off-peak curve
    let congestionFactor = 1.0;
    
    // Late night (midnight to 5am): Close to baseline
    if (hour >= 0 && hour < 5) {
      congestionFactor = 1.0 + (Math.random() * 0.1);
    } 
    // Morning Rush (7am to 9am)
    else if (hour >= 7 && hour < 10) {
      congestionFactor = 1.6 + (Math.random() * 0.3);
    }
    // Evening Rush (4pm to 7pm)
    else if (hour >= 16 && hour < 19) {
      congestionFactor = 1.8 + (Math.random() * 0.4);
    }
    // Midday
    else if (hour >= 10 && hour < 16) {
      congestionFactor = 1.3 + (Math.random() * 0.2);
    }
    // Late evening
    else {
      congestionFactor = 1.1 + (Math.random() * 0.1);
    }
    
    data.push({
      hour,
      scheduledTimeSeconds: Math.round(scheduledTime),
      actualTimeSeconds: Math.round(baselineSeconds * congestionFactor)
    });
  }
  
  return data;
}

export const ROUTE_PERFORMANCE_DATA: Record<string, HourlyPerformance[]> = {
  // 504 King Baseline is roughly 35-40 mins in simulation
  '504': generatePerformanceData(2200), 
  '501': generatePerformanceData(3000),
  '510': generatePerformanceData(1500),
};

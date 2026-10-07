export type NightServiceFrequency = 30 | 60;

export function nightServiceKey(frequency: NightServiceFrequency): 'nightService30' | 'nightService60' {
  return `nightService${frequency}` as 'nightService30' | 'nightService60';
}

export const setDynamicFavicon = (status: 'good' | 'warning' | 'bad') => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  // Clear
  ctx.clearRect(0, 0, 32, 32);

  // Draw Circle Background
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, 2 * Math.PI);
  
  if (status === 'good') ctx.fillStyle = '#10b981'; // emerald-500
  else if (status === 'warning') ctx.fillStyle = '#f59e0b'; // amber-500
  else ctx.fillStyle = '#ef4444'; // red-500
  
  ctx.fill();

  // Draw Inner text or smaller circle
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(16, 16, 6, 0, 2 * Math.PI);
  ctx.fill();

  const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (link) {
    link.href = canvas.toDataURL();
  }
};
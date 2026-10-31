/** Football (soccer ball) icon in the same stroke style as lucide icons: central pentagon + seams to the rim. */
export function SoccerBall({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7.6l3.9 2.8-1.5 4.6H9.6l-1.5-4.6z" fill="currentColor" fillOpacity="0.9" />
      <path d="M12 7.6V2.6M15.9 10.4l4.7-1.6M14.4 15l2.9 4M9.6 15l-2.9 4M8.1 10.4L3.4 8.8" />
    </svg>
  );
}

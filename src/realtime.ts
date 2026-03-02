import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

type RealtimeHandler = () => void;

let echoInstance: Echo<'pusher'> | null = null;

function isEnabled(): boolean {
  const raw = String(import.meta.env.VITE_REALTIME_ENABLED ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

export function getEcho(): Echo<'pusher'> | null {
  if (!isEnabled()) {
    return null;
  }

  if (echoInstance) {
    return echoInstance;
  }

  const key = import.meta.env.VITE_PUSHER_APP_KEY;
  if (!key) {
    return null;
  }

  const wsHost = import.meta.env.VITE_PUSHER_HOST || '127.0.0.1';
  const wsPort = Number(import.meta.env.VITE_PUSHER_PORT || 6001);
  const forceTLS = String(import.meta.env.VITE_PUSHER_SCHEME || 'http') === 'https';

  // Echo expects Pusher on the global window object in browser builds.
  (window as typeof window & { Pusher: typeof Pusher }).Pusher = Pusher;

  echoInstance = new Echo({
    broadcaster: 'pusher',
    key,
    cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER || 'mt1',
    wsHost,
    wsPort,
    wssPort: wsPort,
    forceTLS,
    enabledTransports: ['ws', 'wss'],
  });

  return echoInstance;
}

export function subscribeBackofficeRealtime(onMessage: RealtimeHandler): (() => void) | null {
  const echo = getEcho();
  if (!echo) {
    return null;
  }

  const bookingChannel = echo.channel('backoffice.bookings');
  const driverChannel = echo.channel('backoffice.drivers');
  const announcementChannel = echo.channel('backoffice.announcements');

  bookingChannel.listen('.booking.updated', onMessage);
  driverChannel.listen('.driver.updated', onMessage);
  announcementChannel.listen('.announcement.created', onMessage);

  return () => {
    bookingChannel.stopListening('.booking.updated');
    driverChannel.stopListening('.driver.updated');
    announcementChannel.stopListening('.announcement.created');
    echo.leaveChannel('backoffice.bookings');
    echo.leaveChannel('backoffice.drivers');
    echo.leaveChannel('backoffice.announcements');
  };
}

export type WSHandler = ((type: string, payload: any) => void) | ((message: { type: string; payload: any; ts?: number }) => void);

let ws: WebSocket | null = null;
let handlers: WSHandler[] = [];

export function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handlers.forEach((h) => {
        if (h.length <= 1) {
          (h as (message: { type: string; payload: any; ts?: number }) => void)(data);
        } else {
          (h as (type: string, payload: any) => void)(data.type, data.payload);
        }
      });
    } catch {}
  };
  ws.onclose = () => {
    setTimeout(connectWS, 1000);
  };
}

export function onWS(handler: WSHandler) {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter(h => h !== handler);
  };
}

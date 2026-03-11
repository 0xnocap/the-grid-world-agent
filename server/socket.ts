import { Server as SocketServer } from 'socket.io';
import { getWorkspaceManager } from './workspace.js';

export function setupSocketServer(httpServer: any): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:4100',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:4100',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  const workspace = getWorkspaceManager();
  workspace.setSocketServer(io);

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Send full snapshot on connect
    const snapshot = workspace.getSnapshot();
    socket.emit('workspace:snapshot', snapshot);

    // Handle agent move commands from the UI
    socket.on('agent:move', (data: { agentId: string; x: number; z: number }) => {
      const { agentId, x, z } = data;
      workspace.queueAction(agentId, {
        type: 'MOVE',
        targetPosition: { x, y: 0, z },
      });
    });

    // Handle agent assignment from the UI
    socket.on('agent:assign', (data: { agentIds: string[]; zoneId: string }) => {
      workspace.assignAgentsToZone(data.agentIds, data.zoneId);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  console.log('[Socket] WebSocket server initialized');
  return io;
}

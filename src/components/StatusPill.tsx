import type { AudioEngineStatus } from '../features/audio/types';

interface StatusPillProps {
  status: AudioEngineStatus;
}

const STATUS_LABELS: Record<AudioEngineStatus, string> = {
  idle: 'Idle',
  running: 'Live',
  suspended: 'Paused',
  unsupported: 'Unsupported',
  disposed: 'Disposed'
};

export function StatusPill({ status }: StatusPillProps) {
  return <span className={`status-pill status-pill--${status}`}>{STATUS_LABELS[status]}</span>;
}

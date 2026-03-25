export type BootState = {
  ready: boolean;
  startedAt: string;
  lastError: string | null;
};

export const bootState: BootState = {
  ready: false,
  startedAt: new Date().toISOString(),
  lastError: null,
};

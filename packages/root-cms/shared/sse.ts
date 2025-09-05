export const SSEEvent = {
  CONNECTED: 'connected',
  RECONNECTED: 'reconnected',
  SCHEMA_CHANGED: 'schemaChanged',
};

export interface SSESchemaChangedEvent {
  file: string;
}

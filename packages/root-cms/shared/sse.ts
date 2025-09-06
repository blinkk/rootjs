export const SSEEvent = {
  /**
   * First connection event.
   */
  CONNECTED: 'connected',
  /**
   * Changes to any .schema.ts file.
   */
  SCHEMA_CHANGED: 'schemaChanged',
};

export interface SSEConnectedEvent {
  serverVersion: string;
}

export interface SSESchemaChangedEvent {
  file: string;
}

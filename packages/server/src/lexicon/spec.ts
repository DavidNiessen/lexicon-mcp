import upstream from "./generated/openapi.json" with { type: "json" };

export interface Schema {
  $ref?: string;
  type?: string;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  oneOf?: Schema[];
  allOf?: Schema[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  description?: string;
  [key: string]: unknown;
}

export const specification = upstream as unknown as {
  paths: Record<
    string,
    Record<
      string,
      {
        summary: string;
        description?: string;
        parameters?: Array<
          Schema & {
            name: string;
            required?: boolean;
            schema?: Schema;
            content?: Record<string, { schema: Schema }>;
          }
        >;
        requestBody?: { content: Record<string, { schema: Schema }> };
      }
    >
  >;
  components: {
    schemas: Record<string, Schema>;
    parameters: Record<string, Schema>;
  };
};

export function resolve(schema: Schema): Schema {
  if (!schema.$ref) return schema;
  const parts = schema.$ref.split("/").slice(1);
  let value: unknown = specification;
  for (const part of parts) value = (value as Record<string, unknown>)[part];
  if (!value) throw new Error(`Unknown upstream schema ${schema.$ref}`);
  return { ...(value as Schema), ...schema, $ref: undefined };
}

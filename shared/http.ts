export type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

export function jsonResponse(
  res: ApiResponse,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

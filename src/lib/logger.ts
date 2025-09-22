// lightweight request logger
export const log = (...args: any[]) =>
  console.log(new Date().toISOString(), ...args);

export const withReq = (req: Request) => {
  const id = req.headers.get('x-request-id') ?? Math.random().toString(36).slice(2,8);
  return {
    id,
    log: (...a: any[]) => console.log(`[import:${id}]`, ...a),
    error: (...a: any[]) => console.error(`[import:${id}]`, ...a),
  };
};
